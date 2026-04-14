# emotional_support_service.py
import os
import json
import openai
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
from typing import Dict, List, Optional
import re

app = Flask(__name__)
CORS(app)  

# ==================== 配置 ====================

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").strip()
MODEL_NAME = os.getenv("DEEPSEEK_MODEL", "deepseek-chat").strip()  # 或 "deepseek-reasoner"（更贵但更准）

# 初始化DeepSeek客户端
client = openai.OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL) if DEEPSEEK_API_KEY else None

# 简单的内存存储（生产环境建议换Redis）
conversation_memory = {}  # user_id -> List[Dict]
daily_summaries = {}      # user_id -> Dict[date, summary]

# ==================== Prompt模板 ====================
EMOTION_SYSTEM_PROMPT = """你是Silverbridge，专为60岁以上中国老人设计的AI情感陪伴助手。

【角色设定】
- 亲切的晚辈/邻居口吻，用"您"称呼，不用"你"
- 说话慢、清楚，避免网络用语（如"emo"、"绝绝子"）和英文缩写
- 每次回复2-4句话，每句不超过20个汉字
- 语气温暖、耐心，像对待自己的爷爷奶奶

【安全红线】
- 检测到自杀/自残倾向（如"不想活了"、"死了算了"）：必须设置emergency_alert
- 不给出医疗建议，只说"建议问问医生"或引导至健康模块
- 不主动提及死亡、疾病等负面话题

【输出要求】
必须返回JSON，字段说明：
- reply_text: 给老人的回复文字（口语化、温暖、简短）
- emotion_tag: 情绪标签，只能是 happy/sad/lonely/anxious/neutral/angry 之一
- emotion_confidence: 0-1之间，识别置信度
- tts_enabled: 是否语音播报（默认true）
- tts_speed: 语音速度，老人用"slow"，普通用"normal"
- suggested_action: 特殊操作，none/family_summary/health_redirect/emergency_alert
- quick_replies: 数组，提供3个快捷回复选项，减少老人打字负担
- show_family_bridge: 是否高亮"发给子女"按钮（思念家人、分享回忆时为true）
- summary_snippet: 给子女的一句话摘要（30字内，描述今天聊了什么、情绪如何）

【示例】
输入："孩子们好久没打电话了"
输出：
{
    "reply_text": "您想孩子们了，这种惦记又见不到的感觉，确实让人心里发紧。要不咱们聊聊您年轻时带孩子的趣事？我帮您记下来，等他们打电话时讲给他们听。",
    "emotion_tag": "lonely",
    "emotion_confidence": 0.92,
    "tts_enabled": true,
    "tts_speed": "slow",
    "suggested_action": "family_summary",
    "quick_replies": ["好，聊聊往事", "帮我发给孩子们", "不用了，谢谢"],
    "show_family_bridge": true,
    "summary_snippet": "妈妈今天思念家人，聊起了以前带孩子的回忆，情绪从低落转为温暖"
}"""

SUMMARY_SYSTEM_PROMPT = """你是Silverbridge的每日摘要生成器。
基于老人今天的对话记录，生成给子女看的温暖摘要。

要求：
1. 语气积极，不让子女担心，但如实反映情绪
2. 提及具体话题（如"聊到了工厂往事"、"提到了邻居王阿姨"）
3. 如有持续低落情绪（连续3天以上negative标签），设置alert_flag为true
4. 控制在50字以内

输出JSON格式：
{
    "summary_text": "给子女的温暖摘要",
    "emotion_trend": "up/down/stable",  // 相比昨天情绪好转/变差/持平
    "alert_flag": false,
    "suggestion_to_family": "给子女的建议，如'建议周末打个电话'"
}"""

# ==================== 核心服务类 ====================
class EmotionalSupportEngine:
    
    EMOTION_PATTERNS = {
        "lonely": ["一个人", "没人说话", "空荡荡", "冷清", "闷得慌", "孤单"],
        "miss_family": ["想孩子", "想孙子", "好久没见了", "不打电话", "没消息", "惦记"],
        "sleep_issue": ["睡不着", "失眠", "睡不好", "早醒", "多梦"],
        "health_worry": ["不舒服", "疼", "担心身体", "怕得病", "血压", "血糖"],
        "positive": ["开心", "高兴", "今天不错", "好消息", "舒服", "睡得香"],
        "emergency": ["不想活了", "死了算了", "自杀", "活着没意思", "没人管我死"]
    }
    
    def detect_intent_local(self, message: str) -> tuple:
        """本地快速意图识别，辅助Prompt优化"""
        msg = message.lower()
        for intent, keywords in self.EMOTION_PATTERNS.items():
            if any(k in msg for k in keywords):
                return intent, 0.9
        return "general", 0.6
    
    def is_emergency(self, message: str) -> bool:
        """紧急检测优先本地判断"""
        return any(w in message for w in ["不想活", "死了", "自杀", "活着没意思"])
    
    def build_prompt_with_memory(self, user_id: str, message: str) -> List[Dict]:
        """构建包含历史对话的Prompt"""
        # 获取最近3轮对话作为上下文
        history = conversation_memory.get(user_id, [])[-3:]
        history_text = ""
        for turn in history:
            history_text += f"老人：{turn['user']}\n助手：{turn['ai']}\n"
        
        # 本地意图检测，追加到System Prompt
        intent, _ = self.detect_intent_local(message)
        intent_hint = ""
        if intent == "lonely":
            intent_hint = "\n【当前状态】老人表现出孤独感，请主动陪伴，多倾听，可提议聊聊往事。"
        elif intent == "miss_family":
            intent_hint = "\n【当前状态】老人思念家人，请共情确认，并主动提议生成摘要发给子女。"
        elif intent == "emergency":
            intent_hint = "\n【警告】检测到极端情绪，请紧急安抚并设置emergency_alert。"
        
        messages = [
            {"role": "system", "content": EMOTION_SYSTEM_PROMPT + intent_hint},
            {"role": "user", "content": f"历史对话：\n{history_text}\n\n当前老人说：{message}\n\n请回复JSON格式。"}
        ]
        return messages
    
    def chat(self, user_id: str, message: str) -> Dict:
        """主对话接口"""
        try:
            if client is None:
                return self._fallback_response(user_id, message, "missing_api_key")
            # 1. 紧急检测（本地优先）
            if self.is_emergency(message):
                return self._emergency_response()
            
            # 2. 构建Prompt
            messages = self.build_prompt_with_memory(user_id, message)
            
            # 3. 调用DeepSeek
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                temperature=0.7,  # 情感对话需要一定创造性
                max_tokens=500,
                response_format={"type": "json_object"}  # 强制JSON输出
            )
            
            # 4. 解析响应
            content = response.choices[0].message.content
            result = json.loads(content)
            
            # 5. 字段校验与默认值（防止DeepSeek漏字段）
            result = self._validate_fields(result, message)
            
            # 6. 保存到记忆
            self._save_to_memory(user_id, message, result["reply_text"], result["emotion_tag"])
            
            # 7. 添加元数据
            result.update({
                "conversation_id": f"{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                "timestamp": datetime.now().isoformat(),
                "status": "success"
            })
            
            return result
            
        except json.JSONDecodeError:
            # JSON解析失败，返回兜底回复
            return self._fallback_response(user_id, message, "parse_error")
        except Exception as e:
            print(f"API Error: {e}")
            return self._fallback_response(user_id, message, "api_error")
    
    def generate_daily_summary(self, user_id: str, date_str: Optional[str] = None) -> Dict:
        """生成每日摘要给子女"""
        date_str = date_str or datetime.now().strftime("%Y-%m-%d")
        
        # 获取今天的所有对话
        today_chats = [c for c in conversation_memory.get(user_id, []) 
                      if c.get("date") == date_str]
        
        if not today_chats:
            return {
                "summary_text": "今天还没有聊天，提醒爸妈使用Silverbridge哦~",
                "emotion_trend": "stable",
                "alert_flag": False,
                "suggestion_to_family": "今天爸妈还没聊天，建议晚上打个电话问候。"
            }
        
        # 构建摘要Prompt
        chat_log = "\n".join([f"老人：{c['user']} [情绪：{c['emotion']}]" for c in today_chats])
        
        messages = [
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": f"今日对话记录：\n{chat_log}\n\n请生成JSON格式摘要。"}
        ]
        
        try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                temperature=0.5,
                max_tokens=300,
                response_format={"type": "json_object"}
            )
            result = json.loads(response.choices[0].message.content)
            result.update({
                "date": date_str,
                "chat_count": len(today_chats),
                "status": "success"
            })
            return result
        except Exception as e:
            return {
                "summary_text": "今天爸妈聊得不错，具体细节请直接问问他们吧~",
                "emotion_trend": "stable",
                "alert_flag": False,
                "suggestion_to_family": "建议周末抽时间视频通话。",
                "status": "fallback"
            }
    
    def _validate_fields(self, result: Dict, original_message: str) -> Dict:
        """确保所有必需字段都存在"""
        defaults = {
            "reply_text": "您说的话我记下了，咱们慢慢来，不着急。",
            "emotion_tag": "neutral",
            "emotion_confidence": 0.8,
            "tts_enabled": True,
            "tts_speed": "slow",
            "suggested_action": "none",
            "quick_replies": ["好的", "不用了", "再说一遍"],
            "show_family_bridge": False,
            "summary_snippet": "今天和老人进行了日常对话。"
        }
        
        # 合并默认值和AI返回的值
        for key, value in defaults.items():
            if key not in result or not result[key]:
                result[key] = value
        
        # 特殊逻辑：如果提到家人，强制显示family_bridge
        if any(word in original_message for word in ["孩子", "孙子", "儿子", "女儿", "家人"]):
            result["show_family_bridge"] = True
            if result["suggested_action"] == "none":
                result["suggested_action"] = "family_summary"
        
        return result
    
    def _save_to_memory(self, user_id: str, user_msg: str, ai_reply: str, emotion: str):
        """保存对话历史"""
        if user_id not in conversation_memory:
            conversation_memory[user_id] = []
        
        conversation_memory[user_id].append({
            "user": user_msg,
            "ai": ai_reply,
            "emotion": emotion,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "timestamp": datetime.now().isoformat()
        })
        
        # 只保留最近50轮，防止内存爆炸
        if len(conversation_memory[user_id]) > 50:
            conversation_memory[user_id] = conversation_memory[user_id][-50:]
    
    def _emergency_response(self) -> Dict:
        """紧急情况的兜底回复（不经过AI，确保立即响应）"""
        return {
            "reply_text": "我知道您现在一定很难受。我在这里陪着您。咱们可以给孩子们打个电话，或者我帮您联系社区医生，好吗？千万别一个人扛着。",
            "emotion_tag": "anxious",
            "emotion_confidence": 0.99,
            "tts_enabled": True,
            "tts_speed": "slow",
            "suggested_action": "emergency_alert",
            "quick_replies": ["帮我打电话给儿子", "联系社区医生", "我就是说说"],
            "show_family_bridge": True,
            "summary_snippet": "【紧急】老人表达了极端情绪，请立即关注！",
            "status": "emergency"
        }
    
    def _fallback_response(self, user_id: str, message: str, error_type: str) -> Dict:
        """API失败时的兜底回复"""
        return {
            "reply_text": "不好意思，我刚才没听清。您能再说一遍吗？或者咱们聊聊您今天吃了什么？",
            "emotion_tag": "neutral",
            "emotion_confidence": 0.5,
            "tts_enabled": True,
            "tts_speed": "slow",
            "suggested_action": "none",
            "quick_replies": ["重复一遍", "今天吃了饺子", "不想说了"],
            "show_family_bridge": False,
            "summary_snippet": "今天进行了日常对话。",
            "status": "fallback",
            "error": error_type
        }

# ==================== 初始化引擎 ====================
engine = EmotionalSupportEngine()

# ==================== Flask路由 ====================

@app.route('/emotion/chat', methods=['POST'])
def chat():
    """
    主要对话接口（Xiangzhen的前端调用）
    
    Request:
    {
        "user_id": "user_001",
        "message": "孩子们好久没打电话了",
        "voice_mode": false  // 可选，是否语音输入
    }
    
    Response:
    {
        "status": "success",
        "data": {
            "reply_text": "...",
            "emotion_tag": "lonely",
            "tts_enabled": true,
            "tts_speed": "slow",
            "suggested_action": "family_summary",
            "quick_replies": ["...", "...", "..."],
            "show_family_bridge": true,
            "summary_snippet": "...",
            "conversation_id": "...",
            "timestamp": "..."
        }
    }
    """
    try:
        data = request.json
        user_id = data.get('user_id', 'anonymous')
        message = data.get('message', '')
        
        if not message:
            return jsonify({"status": "error", "message": "message不能为空"}), 400
        
        result = engine.chat(user_id, message)
        return jsonify({"status": "success", "data": result})
    
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/emotion/daily-summary', methods=['POST'])
def daily_summary():
    """
    生成每日摘要（Xiangzhen定时调用，如每晚8点）
    
    Request:
    {
        "user_id": "user_001",
        "date": "2026-04-01"  // 可选，默认今天
    }
    """
    try:
        data = request.json
        user_id = data.get('user_id')
        date_str = data.get('date')
        
        if not user_id:
            return jsonify({"status": "error", "message": "user_id不能为空"}), 400
        
        result = engine.generate_daily_summary(user_id, date_str)
        return jsonify({"status": "success", "data": result})
    
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        "status": "ok", 
        "service": "emotional-support",
        "model": MODEL_NAME,
        "timestamp": datetime.now().isoformat()
    })

# ==================== 启动服务 ====================
if __name__ == '__main__':
    print("🚀 Silverbridge Emotional Support Service Starting...")
    print(f"Model: {MODEL_NAME}")
    print("API Key: (configured)" if DEEPSEEK_API_KEY else "API Key: (missing)")
    
    app.run(host='0.0.0.0', port=5001, debug=True)