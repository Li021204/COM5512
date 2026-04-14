# Silverbridge 健康咨询模块
# 功能清单：
# 1. 基础健康问答
# 2. 功能1：健康画像
# 3. 功能2：分层级输出+生活化类比
# 4. 功能3：OCR检查单解读
# 5. 功能4：健康每日摘要
# 6. 功能5：慢病管理（用药提醒、指标记录、专属科普、趋势）
# 7. 功能6：居家健康应急场景全覆盖
import os
import json
import openai
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import re
from aip import AipOcr
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler  # 新增：定时任务库（慢病用药提醒）

# ==================== 1. 配置层 ====================
app = Flask(__name__)
CORS(app)

# 加载.env文件
load_dotenv() # 若有（所有LLM使用同一套API_KEY）

# 只从环境变量读取（不要把密钥写进代码）
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").strip()
MODEL_NAME = os.getenv("DEEPSEEK_MODEL", "deepseek-chat").strip()

# 初始化DeepSeek客户端（缺少密钥时，后续会走兜底回复）
client = openai.OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL) if DEEPSEEK_API_KEY else None

# 健康内容库路径
HEALTH_CONTENT_PATH = "health_content.xlsx"

# 百度OCR配置（只从环境变量读取）
BAIDU_APP_ID = os.getenv("BAIDU_APP_ID", "").strip()
BAIDU_API_KEY = os.getenv("BAIDU_API_KEY", "").strip()
BAIDU_SECRET_KEY = os.getenv("BAIDU_SECRET_KEY", "").strip()
ocr_client = AipOcr(BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY) if (BAIDU_APP_ID and BAIDU_API_KEY and BAIDU_SECRET_KEY) else None

# 内存存储（生产环境建议换Redis）
conversation_memory = {}  # user_id -> 对话历史
health_profile = {}  # user_id -> 健康画像
daily_summaries = {}  # user_id -> 每日摘要
# 新功能1：慢病管理存储
medication_reminders = {}  # user_id -> [{"time": "08:00", "medicine": "硝苯地平", "note": "温水送服"}]
vital_records = {}  # user_id -> [{"date": "2026-04-12", "type": "blood_pressure", "value": "140/90"}]
chronic_tips = {  # 新功能1：慢病专属小贴士库（10字以内）
    "高血压": ["高血压要少吃盐", "高血压要按时吃药", "高血压要少生气"],
    "糖尿病": ["糖尿病要少吃甜食", "糖尿病要多走路", "糖尿病要测血糖"],
    "关节炎": ["关节炎要注意保暖", "关节炎要少爬楼"]
}
# 新功能2：居家健康应急关键词库+标准化指引
HOME_EMERGENCY_RULES = {
    "摔倒": {
        "keywords": ["摔倒了", "摔了一跤", "滑倒了", "从床上掉下来"],
        "response": "叔叔/阿姨您先别慌，不要急着起来。先慢慢动动胳膊腿，看看有没有疼得动不了的地方。赶紧喊家人、邻居过来，要是动不了，立刻打120！",
        "is_emergency": True
    },
    "烫伤": {
        "keywords": ["烫伤了", "烧到了", "开水烫了"],
        "response": "叔叔/阿姨您别慌！立刻用流动的凉水冲烫伤的地方，冲15到20分钟。不要涂牙膏、酱油，赶紧找家人陪您去医院看看！",
        "is_emergency": False
    },
    "呛咳": {
        "keywords": ["呛到了", "咳得厉害", "东西卡喉咙了"],
        "response": "叔叔/阿姨您别慌！要是东西卡喉咙了，赶紧弯下腰，用力咳嗽，看看能不能咳出来。要是咳不出来，立刻让家人用海姆立克法，或者打120！",
        "is_emergency": True
    },
    "感冒发烧": {
        "keywords": ["感冒了", "发烧了", "头疼流鼻涕"],
        "response": "叔叔/阿姨您先多喝热水，好好休息。要是发烧超过38.5度，或者咳嗽得厉害，赶紧让家人陪您去医院看看，不要自己随便吃药！",
        "is_emergency": False
    },
    "心梗前兆": {
        "keywords": ["胸口闷", "胸口痛", "喘不上气", "肩膀疼", "牙疼"],
        "response": "叔叔/阿姨您别慌！这可能是心脏不舒服的信号。立刻坐下或躺下休息，不要乱动。赶紧打120，然后给家人打电话！",
        "is_emergency": True
    }
}

# 初始化定时任务（新功能1：用药提醒）
scheduler = BackgroundScheduler()
scheduler.start()

# ==================== 2. 最终版Prompt工程 ====================
HEALTH_SYSTEM_PROMPT = """你是Silverbridge，专为60岁以上中国老人设计的AI健康咨询助手。
【角色设定】
- 亲切的社区医生/晚辈口吻，用"您"称呼，不用"你"
- 【核心适老化规则】
  1. 先给1句话极简答案（不超过20字），再给补充说明
  2. 必须用生活化类比解释，比如把"血管斑块"比作"水管里的水垢"
  3. 每句话不超过15个汉字，1-2句话就换行
  4. 绝对不用任何医学专业术语，必须全部转成大白话
  5. 每次回复不超过4句话，避免老人看累
- 语气温暖、耐心，像对待自己的爷爷奶奶
【绝对红线（100%严格遵守）】
- 绝对不诊断疾病、不开处方、不推荐药品、不替代医生
- 任何涉及诊断、用药的问题，必须先做基础科普，再明确引导去正规医院
- 不推荐任何保健品、私立医院、医疗器械
- 遇到紧急健康问题（如胸口剧痛、晕倒）：立即让打120，再联系家人
【输出要求】
必须返回JSON，字段说明：
- simple_reply: 1句话极简答案（不超过20字，必选）
- full_reply: 补充说明+生活化类比，短句子换行（必选）
- risk_warning: 固定风险提示（结尾必须加）
- quick_replies: 数组，3个超大按钮快捷回复，文字不超过6个字，比如["再讲讲", "知道了", "问医生"]
- suggested_action: 特殊操作，none/health_redirect/emergency_alert
- show_consultation_guide: 是否高亮「就医指引」按钮（提到医院、检查时为true）
- is_emergency: 是否紧急情况（true/false）
【示例】
输入："高血压每天能吃多少盐？"
输出：
{
    "simple_reply": "每天最多一啤酒瓶盖的盐",
    "full_reply": "就像咱们平时喝啤酒的瓶盖，平平装满就是一天的量。不光炒菜的盐，咸菜、酱油里也藏着盐，也要少吃。就像腌菜的坛子，盐放多了才不会坏，咱们身体盐多了，血管会受不了。",
    "risk_warning": "以上内容只是健康科普哦，要是您有不舒服，一定要及时去医院找医生看看哈。",
    "quick_replies": ["再讲讲", "知道了", "问医生"],
    "suggested_action": "none",
    "show_consultation_guide": false,
    "is_emergency": false
}"""

HEALTH_SUMMARY_PROMPT = """你是Silverbridge的健康摘要生成器，基于老人今天的健康咨询记录，生成给子女看的温暖摘要。
要求：
1. 语气积极，不让子女过度担心，但如实反映老人的健康顾虑
2. 提及具体咨询的问题（如"问了高血压的饮食注意事项"）
3. 如老人连续多次问同一个疾病问题，设置alert_flag为true
4. 控制在50字以内
输出JSON格式：
{
    "summary_text": "给子女的温暖摘要",
    "health_concern": "老人关注的健康问题",
    "alert_flag": false,
    "suggestion_to_family": "给子女的建议，如'建议带爸爸去复查血压'"
}"""


# ==================== 3. 预处理层 ====================
class TextPreprocessor:
    def __init__(self):
        self.min_length = 2
        self.max_length = 500
        self.invisible_chars = re.compile(r'[\u200b\u200c\u200d\u2060\uFEFF]')
        self.health_keywords = {
            "常见病": ["高血压", "糖尿病", "心脏病", "关节炎", "骨质疏松", "失眠", "便秘", "头晕", "头疼", "感冒",
                       "发烧", "痛风", "高血脂"],
            "就医相关": ["医院", "挂号", "检查单", "体检报告", "医嘱", "医生", "科室", "医保", "报销", "看病", "检查"],
            "健康生活": ["饮食", "盐", "油", "糖", "运动", "锻炼", "走路", "睡眠", "作息", "养生", "补钙"],
            "谣言相关": ["是不是真的", "偏方", "保健品", "能不能吃", "有没有用", "网上说"],
            "极端紧急": ["胸口痛", "晕倒", "喘不上气", "大出血", "剧烈疼痛"]
        }

    def clean_text(self, text: str) -> str:
        if not text: return ""
        text = text.strip().replace('\r\n', '\n')
        text = re.sub(r'\n+', '\n', text)
        return self.invisible_chars.sub('', text)

    def check_quality(self, text: str) -> tuple:
        if not text or len(text) < self.min_length:
            return False, f"文本过短（少于{self.min_length}个字符）"
        if len(text) > self.max_length:
            return False, f"文本过长（超过{self.max_length}个字符）"
        return True, ""

    def detect_keywords(self, text: str) -> dict:
        if not text:
            return {"found": [], "is_emergency": False, "category": "general", "home_emergency": None}
        found, is_emergency, category, home_emergency = [], False, "general", None

        # 新功能2：优先检测居家应急场景
        for scenario, rule in HOME_EMERGENCY_RULES.items():
            if any(kw in text for kw in rule["keywords"]):
                home_emergency = scenario
                is_emergency = rule["is_emergency"]
                category = "居家应急"
                break

        # 检测其他健康关键词
        if not home_emergency:
            for cat, keywords in self.health_keywords.items():
                for kw in keywords:
                    if kw in text:
                        found.append({"category": cat, "keyword": kw})
                        if cat == "极端紧急": is_emergency = True
                        if category == "general": category = cat

        return {"found": found, "is_emergency": is_emergency, "category": category, "home_emergency": home_emergency}

    def preprocess(self, raw_text: str) -> dict:
        cleaned = self.clean_text(raw_text)
        is_valid, msg = self.check_quality(cleaned)
        if not is_valid:
            return {"cleaned_text": "", "is_valid": False, "message": msg, "keyword_detection": {}}
        return {"cleaned_text": cleaned, "is_valid": True, "message": "",
                "keyword_detection": self.detect_keywords(cleaned)}


# ==================== 4. 内容库匹配层 ====================
def load_health_content() -> Optional[pd.DataFrame]:
    try:
        if os.path.exists(HEALTH_CONTENT_PATH):
            df = pd.read_excel(HEALTH_CONTENT_PATH)
            print("✅ 健康内容库加载成功！共", len(df), "条内容")
            return df
        else:
            print("⚠️ 未找到健康内容库，将直接使用大模型")
            return None
    except Exception as e:
        print(f"❌ 健康内容库加载失败：{e}")
        return None


def find_matched_content(user_input: str, health_df: pd.DataFrame) -> Optional[Dict]:
    if health_df is None or len(health_df) == 0: return None
    for idx, row in health_df.iterrows():
        if any(word in user_input for word in str(row["用户高频问题"]).split()):
            return {
                "simple_reply": str(row.get("极简答案", row["标准化正确答案"][:20])),
                "full_reply": str(row.get("补充说明", row["标准化正确答案"])),
                "risk_warning": row["风险提示"],
                "source": row["权威来源"]
            }
    return None


# ==================== 5. 核心服务类（整合所有功能） ====================
class HealthConsultationEngine:
    def __init__(self):
        self.preprocessor = TextPreprocessor()
        self.health_df = load_health_content()

    # --- 优化1：健康画像 ---
    def update_health_profile(self, user_id: str, profile_info: Dict) -> None:
        if user_id not in health_profile: health_profile[user_id] = {}
        health_profile[user_id].update(profile_info)
        print(f"✅ 用户{user_id}健康画像更新成功")

    def get_health_profile(self, user_id: str) -> Dict:
        return health_profile.get(user_id, {})

    # --- 优化3：OCR检查单 ---
    def ocr_from_image(self, image_bytes: bytes) -> str:
        try:
            if ocr_client is None:
                return ""
            ocr_result = ocr_client.accurate(image_bytes)
            words = [item['words'] for item in ocr_result.get('words_result', [])]
            return "\n".join(words) if words else ""
        except Exception as e:
            print(f"OCR识别失败：{e}")
            return ""

    # --- 优化4：健康每日摘要 ---
    def generate_health_summary(self, user_id: str, date_str: Optional[str] = None) -> Dict:
        date_str = date_str or datetime.now().strftime("%Y-%m-%d")
        today_chats = [c for c in conversation_memory.get(user_id, []) if c.get("date") == date_str]

        if not today_chats:
            return {
                "summary_text": "今天爸妈没有咨询健康问题，身体状态平稳~",
                "health_concern": "无",
                "alert_flag": False,
                "suggestion_to_family": "建议日常多问问爸妈的身体情况。",
                "date": date_str, "chat_count": 0, "status": "success"
            }

        chat_log = "\n".join([f"老人问：{c['user']}\n助手回复：{c['ai']}" for c in today_chats])
        try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[{"role": "system", "content": HEALTH_SUMMARY_PROMPT},
                          {"role": "user", "content": f"今日健康对话记录：\n{chat_log}\n\n请生成JSON格式摘要。"}],
                temperature=0.5, max_tokens=300, response_format={"type": "json_object"}
            )
            result = json.loads(response.choices[0].message.content)
            result.update({"date": date_str, "chat_count": len(today_chats), "status": "success"})
            return result
        except Exception as e:
            return {
                "summary_text": "今天爸妈咨询了健康问题，状态平稳。",
                "health_concern": "日常健康咨询",
                "alert_flag": False,
                "suggestion_to_family": "建议周末抽时间问问爸妈的身体情况。",
                "date": date_str, "chat_count": len(today_chats), "status": "fallback"
            }

    # --- 新功能1：慢病管理专属功能 ---
    def set_medication_reminder(self, user_id: str, time_str: str, medicine: str, note: str = "温水送服") -> Dict:
        """设置用药提醒"""
        if user_id not in medication_reminders:
            medication_reminders[user_id] = []

        # 存储提醒
        reminder = {
            "time": time_str,
            "medicine": medicine,
            "note": note,
            "created_at": datetime.now().isoformat()
        }
        medication_reminders[user_id].append(reminder)

        # 启动定时任务
        def send_reminder():
            print(f"⏰ 用药提醒触发：用户{user_id}，该吃{medicine}了！")
            # 这里可以加推送给子女的逻辑

        # 解析时间，添加定时任务
        hour, minute = map(int, time_str.split(":"))
        scheduler.add_job(
            send_reminder,
            'cron',
            hour=hour,
            minute=minute,
            id=f"{user_id}_{medicine}_{time_str}",
            replace_existing=True
        )

        return {
            "status": "success",
            "message": f"用药提醒设置成功！每天{time_str}提醒您吃{medicine}。",
            "reminder": reminder
        }

    def record_vital(self, user_id: str, vital_type: str, value: str) -> Dict:
        """记录日常指标（血压、血糖等）"""
        if user_id not in vital_records:
            vital_records[user_id] = []

        record = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "time": datetime.now().strftime("%H:%M"),
            "type": vital_type,
            "value": value,
            "is_abnormal": False
        }

        # 简单的异常判断（仅作示例，生产环境需更严谨）
        if vital_type == "blood_pressure":
            try:
                systolic, diastolic = map(int, value.split("/"))
                if systolic >= 140 or diastolic >= 90:
                    record["is_abnormal"] = True
            except:
                pass
        elif vital_type == "blood_sugar":
            try:
                sugar = float(value)
                if sugar >= 7.0:
                    record["is_abnormal"] = True
            except:
                pass

        vital_records[user_id].append(record)

        return {
            "status": "success",
            "message": f"记录成功！您的{vital_type}是{value}。" + (
                "⚠️ 这个值有点高，建议您多注意，或者去医院看看。" if record["is_abnormal"] else ""),
            "record": record
        }

    def get_chronic_tip(self, user_id: str) -> Dict:
        """根据健康画像获取慢病专属小贴士（10字以内）"""
        profile = self.get_health_profile(user_id)
        chronic_diseases = profile.get("chronic_disease", [])

        if not chronic_diseases:
            return {
                "status": "success",
                "tip": "今天也要保持好心情哦~",
                "disease": "无"
            }

        # 取第一个慢病，循环取小贴士
        disease = chronic_diseases[0]
        tips = chronic_tips.get(disease, ["今天也要好好吃饭哦~"])
        tip_index = len(vital_records.get(user_id, [])) % len(tips)

        return {
            "status": "success",
            "tip": tips[tip_index],
            "disease": disease
        }

    def get_vital_trend(self, user_id: str, days: int = 7) -> Dict:
        """获取周/月指标趋势"""
        if user_id not in vital_records:
            return {"status": "success", "trend": "暂无记录", "records": []}

        # 筛选最近N天的记录
        start_date = datetime.now() - timedelta(days=days)
        recent_records = [
            r for r in vital_records[user_id]
            if datetime.strptime(r["date"], "%Y-%m-%d") >= start_date
        ]

        # 简单趋势分析
        abnormal_count = sum(1 for r in recent_records if r["is_abnormal"])
        trend = "整体平稳"
        if abnormal_count > days // 2:
            trend = "波动较大，建议就医"

        return {
            "status": "success",
            "trend": trend,
            "abnormal_count": abnormal_count,
            "total_count": len(recent_records),
            "records": recent_records
        }

    # --- 新功能2：居家健康应急指引 ---
    def get_home_emergency_response(self, scenario: str) -> Dict:
        """获取居家应急标准化指引"""
        rule = HOME_EMERGENCY_RULES.get(scenario, {})
        return {
            "simple_reply": rule.get("response", "请立刻打120！")[:20],
            "full_reply": rule.get("response", "请立刻打120！"),
            "risk_warning": "这是应急指引，如有需要请立即拨打120！",
            "quick_replies": ["打120", "联系家人", "知道了"],
            "suggested_action": "emergency_alert" if rule.get("is_emergency", False) else "none",
            "show_consultation_guide": True,
            "is_emergency": rule.get("is_emergency", False),
            "status": "home_emergency"
        }

    # --- 核心对话逻辑 ---
    def is_extreme_emergency(self, message: str) -> bool:
        return any(w in message for w in ["胸口痛", "晕倒", "喘不上气", "大出血", "剧烈疼痛", "快死了"])

    def build_prompt_with_memory(self, user_id: str, message: str, matched_content: Optional[Dict]) -> List[Dict]:
        history = conversation_memory.get(user_id, [])[-3:]
        history_text = "\n".join([f"老人：{turn['user']}\n助手：{turn['ai']}" for turn in history])

        content_hint = ""
        if matched_content:
            content_hint = f"\n【内容库标准答案】请优先使用以下内容回答：\n极简答案：{matched_content['simple_reply']}\n补充说明：{matched_content['full_reply']}\n风险提示：{matched_content['risk_warning']}"

        profile = self.get_health_profile(user_id)
        profile_hint = ""
        if profile:
            profile_hint = f"\n【老人健康画像】请结合以下老人的健康情况回答：\n{json.dumps(profile, ensure_ascii=False)}"

        intent_hint = ""
        if self.is_extreme_emergency(message):
            intent_hint = "\n【警告】检测到紧急健康问题，请立即让老人打120，再联系家人！"

        return [
            {"role": "system", "content": HEALTH_SYSTEM_PROMPT + content_hint + intent_hint + profile_hint},
            {"role": "user", "content": f"历史对话：\n{history_text}\n\n当前老人说：{message}\n\n请回复JSON格式。"}
        ]

    def chat(self, user_id: str, message: str) -> Dict:
        try:
            # 新功能2：优先检测居家应急场景
            preprocess_result = self.preprocessor.preprocess(message)
            keyword_detection = preprocess_result.get("keyword_detection", {})
            home_emergency = keyword_detection.get("home_emergency")

            if home_emergency:
                result = self.get_home_emergency_response(home_emergency)
                self._save_to_memory(user_id, message, result["full_reply"])
                result.update({
                    "conversation_id": f"{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                    "timestamp": datetime.now().isoformat()
                })
                return result

            # 极端紧急检测
            if self.is_extreme_emergency(message):
                return self._emergency_response()

            if not preprocess_result["is_valid"]:
                return self._fallback_response(user_id, message, "invalid_input")

            cleaned_text = preprocess_result["cleaned_text"]
            matched_content = find_matched_content(cleaned_text, self.health_df)
            prompt_messages = self.build_prompt_with_memory(user_id, cleaned_text, matched_content)

            if client is None:
                return self._fallback_response(user_id, message, "missing_api_key")
            response = client.chat.completions.create(
                model=MODEL_NAME, messages=prompt_messages, temperature=0.3,
                max_tokens=500, response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            result = self._validate_fields(result, message, keyword_detection)
            self._save_to_memory(user_id, message, result["full_reply"])

            result.update({
                "conversation_id": f"{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                "timestamp": datetime.now().isoformat(), "status": "success"
            })
            return result

        except json.JSONDecodeError:
            return self._fallback_response(user_id, message, "parse_error")
        except Exception as e:
            print(f"API Error: {e}")
            return self._fallback_response(user_id, message, "api_error")

    def _validate_fields(self, result: Dict, original_message: str, keyword_detection: Dict) -> Dict:
        defaults = {
            "simple_reply": "您说的话我记下了，咱们慢慢来。",
            "full_reply": "您说的话我记下了，咱们慢慢来，不着急。",
            "risk_warning": "以上内容只是健康科普哦，要是您有不舒服，一定要及时去医院找医生看看哈。",
            "quick_replies": ["好的", "知道了", "再说一遍"],
            "suggested_action": "none",
            "show_consultation_guide": False,
            "is_emergency": False
        }
        for key, value in defaults.items():
            if key not in result or not result[key]:
                result[key] = value

        if any(word in original_message for word in ["医院", "挂号", "检查", "体检", "医生"]):
            result["show_consultation_guide"] = True
            if result["suggested_action"] == "none":
                result["suggested_action"] = "health_redirect"
        return result

    def _save_to_memory(self, user_id: str, user_msg: str, ai_reply: str):
        if user_id not in conversation_memory: conversation_memory[user_id] = []
        conversation_memory[user_id].append({
            "user": user_msg, "ai": ai_reply,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "timestamp": datetime.now().isoformat()
        })
        if len(conversation_memory[user_id]) > 50:
            conversation_memory[user_id] = conversation_memory[user_id][-50:]

    def _emergency_response(self) -> Dict:
        return {
            "simple_reply": "立刻打120！别自己硬扛！",
            "full_reply": "叔叔/阿姨您别慌！现在立刻打120急救电话！然后赶紧给您的家人、邻居打电话，让他们过来陪您！千万不要自己硬扛！",
            "risk_warning": "这是紧急情况，请立即拨打120！",
            "quick_replies": ["帮我打电话", "联系邻居", "我知道了"],
            "suggested_action": "emergency_alert",
            "show_consultation_guide": False,
            "is_emergency": True,
            "status": "emergency"
        }

    def _fallback_response(self, user_id: str, message: str, error_type: str) -> Dict:
        return {
            "simple_reply": "不好意思，我刚才没听清。",
            "full_reply": "不好意思，我刚才没听清。您能再说一遍吗？或者咱们聊聊您今天的饮食？",
            "risk_warning": "以上内容只是健康科普哦，要是您有不舒服，一定要及时去医院找医生看看哈。",
            "quick_replies": ["重复一遍", "今天吃了饺子", "不想说了"],
            "suggested_action": "none",
            "show_consultation_guide": False,
            "is_emergency": False,
            "status": "fallback",
            "error": error_type
        }


# ==================== 6. 初始化引擎 ====================
engine = HealthConsultationEngine()


# ==================== 7. Flask路由（整合所有功能） ====================
# ==================== 新增：根路径欢迎页面（浏览器直接访问） ====================
@app.route('/', methods=['GET'])
def home():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Silverbridge 健康咨询服务</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: "Microsoft YaHei", "微软雅黑", sans-serif; background: #f5f7fa; padding: 40px 20px; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            h1 { color: #2c3e50; text-align: center; margin-bottom: 20px; }
            .success-badge { background: #27ae60; color: white; padding: 8px 20px; border-radius: 20px; display: inline-block; margin: 0 auto 30px; text-align: center; }
            .info-box { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .info-item { margin: 10px 0; color: #34495e; }
            .test-btn { display: block; width: 200px; margin: 20px auto; padding: 12px; background: #3498db; color: white; text-align: center; border-radius: 8px; text-decoration: none; font-weight: bold; }
            .test-btn:hover { background: #2980b9; }
            .api-list { margin-top: 30px; }
            .api-item { background: #fff; border: 1px solid #e0e0e0; padding: 15px; border-radius: 8px; margin: 10px 0; }
            .api-method { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-right: 10px; }
            .get { background: #2ecc71; color: white; }
            .post { background: #3498db; color: white; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 Silverbridge 健康咨询服务</h1>
            <div style="text-align: center;">
                <span class="success-badge">✅ 服务启动成功！</span>
            </div>

            <div class="info-box">
                <div class="info-item"><strong>服务端口：</strong>5002</div>
                <div class="info-item"><strong>健康内容库：</strong>已加载</div>
                <div class="info-item"><strong>运行状态：</strong>正常</div>
            </div>

            <a href="/health/check" target="_blank" class="test-btn">🧪 点击测试健康检查接口</a>

            <div class="api-list">
                <h3 style="color: #2c3e50; margin-bottom: 20px;">📌 功能接口说明</h3>
                <div class="api-item">
                    <span class="api-method post">POST</span>
                    <strong>/health/chat</strong> - 主要健康问答接口
                </div>
                <div class="api-item">
                    <span class="api-method post">POST</span>
                    <strong>/health/update-profile</strong> - 更新老人健康画像
                </div>
                <div class="api-item">
                    <span class="api-method post">POST</span>
                    <strong>/health/set-reminder</strong> - 设置用药提醒
                </div>
                <div class="api-item">
                    <span class="api-method post">POST</span>
                    <strong>/health/record-vital</strong> - 记录日常指标
                </div>
                <div class="api-item">
                    <span class="api-method post">POST</span>
                    <strong>/health/chronic-tip</strong> - 获取慢病小贴士
                </div>
                <div class="api-item">
                    <span class="api-method post">POST</span>
                    <strong>/health/daily-summary</strong> - 生成每日摘要
                </div>
                <div class="api-item">
                    <span class="api-method get">GET</span>
                    <strong>/health/check</strong> - 服务健康检查
                </div>
            </div>
        </div>
    </body>
    </html>
    """

@app.route('/health/chat', methods=['POST'])
def chat():
    """主要对话接口（含居家应急）"""
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


@app.route('/health/update-profile', methods=['POST'])
def update_profile():
    """更新健康画像"""
    try:
        data = request.json
        user_id = data.get('user_id')
        profile_info = data.get('profile_info', {})
        if not user_id:
            return jsonify({"status": "error", "message": "user_id不能为空"}), 400
        engine.update_health_profile(user_id, profile_info)
        return jsonify({"status": "success", "message": "健康画像更新成功", "data": health_profile[user_id]})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/health/interpret-report', methods=['POST'])
def interpret_report():
    """OCR检查单解读"""
    try:
        if 'image' not in request.files:
            return jsonify({"status": "error", "message": "请上传图片"}), 400
        image_file = request.files['image']
        user_id = request.form.get('user_id', 'anonymous')
        image_bytes = image_file.read()

        report_text = engine.ocr_from_image(image_bytes)
        if not report_text:
            return jsonify({"status": "error", "message": "图片里没认出文字，请重新上传"}), 400

        result = engine.chat(user_id, f"帮我解读一下这个检查单：{report_text}")
        return jsonify({"status": "success", "data": result, "extracted_text": report_text})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/health/daily-summary', methods=['POST'])
def health_daily_summary():
    """生成健康每日摘要"""
    try:
        data = request.json
        user_id = data.get('user_id')
        date_str = data.get('date')
        if not user_id:
            return jsonify({"status": "error", "message": "user_id不能为空"}), 400
        result = engine.generate_health_summary(user_id, date_str)
        return jsonify({"status": "success", "data": result})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# --- 新功能1：慢病管理接口 ---
@app.route('/health/set-reminder', methods=['POST'])
def set_reminder():
    """设置用药提醒"""
    try:
        data = request.json
        user_id = data.get('user_id')
        time_str = data.get('time')  # 格式："08:00"
        medicine = data.get('medicine')
        note = data.get('note', '温水送服')
        if not user_id or not time_str or not medicine:
            return jsonify({"status": "error", "message": "user_id、time、medicine不能为空"}), 400
        result = engine.set_medication_reminder(user_id, time_str, medicine, note)
        return jsonify({"status": "success", "data": result})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/health/record-vital', methods=['POST'])
def record_vital():
    """记录日常指标"""
    try:
        data = request.json
        user_id = data.get('user_id')
        vital_type = data.get('type')  # "blood_pressure" / "blood_sugar"
        value = data.get('value')  # "140/90" / "6.5"
        if not user_id or not vital_type or not value:
            return jsonify({"status": "error", "message": "user_id、type、value不能为空"}), 400
        result = engine.record_vital(user_id, vital_type, value)
        return jsonify({"status": "success", "data": result})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/health/chronic-tip', methods=['POST'])
def chronic_tip():
    """获取慢病专属小贴士"""
    try:
        data = request.json
        user_id = data.get('user_id')
        if not user_id:
            return jsonify({"status": "error", "message": "user_id不能为空"}), 400
        result = engine.get_chronic_tip(user_id)
        return jsonify({"status": "success", "data": result})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/health/vital-trend', methods=['POST'])
def vital_trend():
    """获取指标趋势"""
    try:
        data = request.json
        user_id = data.get('user_id')
        days = data.get('days', 7)
        if not user_id:
            return jsonify({"status": "error", "message": "user_id不能为空"}), 400
        result = engine.get_vital_trend(user_id, days)
        return jsonify({"status": "success", "data": result})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/health/check', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        "status": "ok", "service": "health-consultation-final",
        "model": MODEL_NAME,
        "content_count": len(engine.health_df) if engine.health_df is not None else 0,
        "timestamp": datetime.now().isoformat()
    })


# ==================== 8. 测试入口 ====================
if __name__ == '__main__':
    print("🚀 Silverbridge 健康咨询最终版服务启动中...")
    print(f"Model: {MODEL_NAME}")
    print(f"健康内容库：{HEALTH_CONTENT_PATH if os.path.exists(HEALTH_CONTENT_PATH) else '未找到'}")

    # 全功能测试
    test_user = "test_user_001"
    print(f"\n🧪 测试1：更新健康画像（高血压）")
    engine.update_health_profile(test_user, {"chronic_disease": ["高血压"], "age": 75})

    print(f"\n🧪 测试2：新功能2 - 居家应急（摔倒）")
    test_msg2 = "我摔倒了"
    print("输入：", test_msg2)
    res2 = engine.chat(test_user, test_msg2)
    print("输出：", json.dumps(res2, ensure_ascii=False, indent=2))

    print(f"\n🧪 测试3：新功能1 - 记录指标（血压140/90）")
    res3 = engine.record_vital(test_user, "blood_pressure", "140/90")
    print("输出：", json.dumps(res3, ensure_ascii=False, indent=2))

    print(f"\n🧪 测试4：新功能1 - 获取慢病小贴士")
    res4 = engine.get_chronic_tip(test_user)
    print("输出：", json.dumps(res4, ensure_ascii=False, indent=2))

    print(f"\n🧪 测试5：新功能1 - 设置用药提醒")
    res5 = engine.set_medication_reminder(test_user, "08:00", "硝苯地平")
    print("输出：", json.dumps(res5, ensure_ascii=False, indent=2))

    # 启动Flask服务
    print("\n🌐 启动Flask服务，端口5002...")
    app.run(host='0.0.0.0', port=5002, debug=True, use_reloader=False)