# anti_scam_pipeline.py
# 大陆老年人反诈安全模块 - 完整流水线
# 整合：输入层(文本/截图/录音) + 预处理层 + LLM分析层 + 数据库匹配层 + 综合输出层

import re
import json
import os
import requests
import io
import wave
try:
    from aip import AipOcr, AipSpeech  # type: ignore
except Exception as e:
    AipOcr = None  # type: ignore
    AipSpeech = None  # type: ignore
    _AIP_IMPORT_ERROR = f"{type(e).__name__}: {e}"
else:
    _AIP_IMPORT_ERROR = ""
from typing import Optional, List, Dict, Any

# ==================== 配置 ====================

# 获取当前文件所在目录
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

# 尝试加载项目根目录 .env（本地开发用；云端用环境变量）
try:
    from dotenv import load_dotenv  # type: ignore

    ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
    load_dotenv(os.path.join(ROOT_DIR, ".env"), override=False)
except Exception:
    pass

# 百度 OCR 配置（优先读环境变量：适配 Vercel）
BAIDU_APP_ID = os.getenv("BAIDU_APP_ID", "").strip()
BAIDU_API_KEY = os.getenv("BAIDU_API_KEY", "").strip()
BAIDU_SECRET_KEY = os.getenv("BAIDU_SECRET_KEY", "").strip()

# 百度语音识别配置（优先读环境变量：适配 Vercel）
SPEECH_APP_ID = os.getenv("SPEECH_APP_ID", "").strip()
SPEECH_API_KEY = os.getenv("SPEECH_API_KEY", "").strip()
SPEECH_SECRET_KEY = os.getenv("SPEECH_SECRET_KEY", "").strip()

# DeepSeek API 配置（优先读环境变量：适配 Vercel）
# 兼容两种命名：DEEPSEEK_API_KEY / DEEPSEEK_API_KEY
DEEPSEEK_API_KEY = (os.getenv("DEEPSEEK_API_KEY", "") or os.getenv("DEEPSEEK_API_KEY", "")).strip()
DEEPSEEK_URL = os.getenv("DEEPSEEK_URL", "https://api.deepseek.com/v1/chat/completions").strip()

# 数据库路径（优先使用当前目录，否则使用桌面）
if os.path.exists(os.path.join(CURRENT_DIR, "反诈新闻数据库.xlsx")):
    DATABASE_PATH = os.path.join(CURRENT_DIR, "反诈新闻数据库.xlsx")
else:
    DATABASE_PATH = r"C:\Users\97201\Desktop\反诈新闻数据库.xlsx"
    
# ==================== 初始化客户端 ====================
# 重要：在某些部署环境中（例如 Vercel Serverless），依赖未正确安装时 AipOcr/AipSpeech 可能为 None。
# 必须先判断可调用性，否则会出现：'NoneType' object is not callable
ocr_client = (
    AipOcr(BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY)
    if (callable(AipOcr) and BAIDU_APP_ID and BAIDU_API_KEY and BAIDU_SECRET_KEY)
    else None
)
speech_client = (
    AipSpeech(SPEECH_APP_ID, SPEECH_API_KEY, SPEECH_SECRET_KEY)
    if (callable(AipSpeech) and SPEECH_APP_ID and SPEECH_API_KEY and SPEECH_SECRET_KEY)
    else None
)

_LAST_ASR_ERROR = ""

def _inspect_wav(wav_bytes: bytes) -> tuple[int, int, int]:
    """
    Returns (sample_rate, channels, sampwidth_bytes) from WAV header.
    Uses stdlib only to stay Vercel-lightweight.
    """
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        return int(wf.getframerate()), int(wf.getnchannels()), int(wf.getsampwidth())


def _normalize_wav_to_16k_mono_16bit(wav_bytes: bytes) -> bytes:
    """
    Convert WAV bytes to: 16kHz, mono, 16-bit PCM using stdlib only.
    This makes uploads from iOS/macOS (often 24k/44.1k) compatible with Baidu ASR.

    Notes:
    - Pure-python linear resampling (no audioop; removed in Python 3.13).
    - Only supports uncompressed PCM WAV.
    """
    import math
    import struct
    from array import array

    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        sr = int(wf.getframerate())
        ch = int(wf.getnchannels())
        sw = int(wf.getsampwidth())
        comp = str(wf.getcomptype() or "")
        if comp != "NONE":
            raise RuntimeError(f"WAV 压缩格式不支持：{comp}（请上传 PCM WAV）")
        frames = wf.readframes(wf.getnframes())

    if sw != 2:
        raise RuntimeError(f"WAV 位宽不支持：{sw*8}bit（请上传 16bit PCM WAV）")

    # Decode little-endian int16 samples
    if len(frames) % 2 != 0:
        raise RuntimeError("WAV 数据长度异常（非 16bit 对齐）")
    a = array("h")
    a.frombytes(frames)
    # array('h') is native-endian; WAV is little-endian. Fix if needed.
    if struct.pack("=h", 1) != b"\x01\x00":  # big-endian host
        a.byteswap()

    # Stereo -> mono (average channels)
    if ch == 2:
        mono = array("h")
        for i in range(0, len(a) - 1, 2):
            mono.append(int((int(a[i]) + int(a[i + 1])) / 2))
        a = mono
        ch = 1
    elif ch != 1:
        raise RuntimeError(f"WAV 声道不支持：{ch}（请上传单声道或双声道 WAV）")

    # Resample to 16k if needed (linear interpolation)
    target_sr = 16000
    if sr != target_sr:
        if len(a) < 2:
            raise RuntimeError("WAV 音频过短，无法重采样")
        ratio = target_sr / float(sr)
        new_len = max(1, int(math.floor(len(a) * ratio)))
        out_samples = array("h")
        for i in range(new_len):
            pos = i / ratio  # pos in original sample index
            idx = int(pos)
            if idx >= len(a) - 1:
                s = int(a[-1])
            else:
                frac = pos - idx
                s0 = int(a[idx])
                s1 = int(a[idx + 1])
                s = int(round((1.0 - frac) * s0 + frac * s1))
            # clamp int16
            if s > 32767:
                s = 32767
            elif s < -32768:
                s = -32768
            out_samples.append(s)
        a = out_samples
        sr = target_sr

    out = io.BytesIO()
    with wave.open(out, "wb") as wo:
        wo.setnchannels(ch)
        wo.setsampwidth(sw)
        wo.setframerate(sr)
        # Write little-endian int16 bytes
        frames2 = a.tobytes()
        # array uses native endianness
        if struct.pack("=h", 1) != b"\x01\x00":  # big-endian host
            a2 = array("h", a)
            a2.byteswap()
            frames2 = a2.tobytes()
        wo.writeframes(frames2)
    return out.getvalue()


# ==================== 1. 输入层：OCR 函数 ====================
def ocr_from_image_bytes(image_bytes: bytes) -> str:
    """
    从图片字节流中提取文字
    """
    try:
        if not ocr_client:
            return ""
        ocr_result = ocr_client.accurate(image_bytes)
        words = [item['words'] for item in ocr_result.get('words_result', [])]
        text = "\n".join(words) if words else ""
        return text
    except Exception as e:
        return ""


def ocr_from_image_path(image_path: str) -> str:
    """
    从图片文件路径提取文字
    """
    try:
        with open(image_path, 'rb') as f:
            image_bytes = f.read()
        return ocr_from_image_bytes(image_bytes)
    except Exception as e:
        return ""


# ==================== 2. 输入层：语音识别函数 ====================

def audio_to_text_from_bytes(audio_bytes: bytes, audio_format: str = 'wav', sample_rate: int = 16000) -> str:
    """
    从音频字节流识别文字
    支持格式：wav, pcm, mp3 (建议16kHz采样率)
    
    参数:
        audio_bytes: 音频字节流
        audio_format: 音频格式 ('wav', 'pcm', 'mp3', 'amr')
        sample_rate: 采样率 (8000, 16000)
    """
    try:
        # 百度语音识别API
        # dev_pid 参数说明：
        # 1537: 普通话(纯中文识别) 默认
        # 1536: 普通话(中英文混合)
        # 1737: 英语
        # 1637: 粤语
        if not speech_client:
            global _LAST_ASR_ERROR
            if (SPEECH_APP_ID and SPEECH_API_KEY and SPEECH_SECRET_KEY) and (not callable(AipSpeech)):
                _LAST_ASR_ERROR = "语音识别依赖未就绪：未正确安装 baidu-aip（AipSpeech 导入失败）"
            else:
                _LAST_ASR_ERROR = "未配置百度语音识别：SPEECH_APP_ID / SPEECH_API_KEY / SPEECH_SECRET_KEY"
            return ""
        _LAST_ASR_ERROR = ""

        fmt = (audio_format or "wav").lower()
        data = audio_bytes
        sr = int(sample_rate) if int(sample_rate) in (8000, 16000) else 16000

        if fmt == "wav":
            try:
                wav_sr, wav_ch, wav_sw = _inspect_wav(audio_bytes)
                # Normalize common WAV formats (24k/44.1k, stereo, 32bit float...) to Baidu-friendly WAV.
                if wav_sr != 16000 or wav_ch != 1 or wav_sw != 2:
                    data = _normalize_wav_to_16k_mono_16bit(audio_bytes)
                sr = 16000
            except Exception as e:
                _LAST_ASR_ERROR = f"WAV 处理失败：{e}"
                return ""

        result = speech_client.asr(
            data,
            fmt,
            sr,
            {'dev_pid': 1537}  # 1537 = 普通话
        )
        
        if result and result.get('err_no') == 0:
            recognized_text = ''.join(result.get('result', []))
            return recognized_text
        else:
            err_no = result.get("err_no") if isinstance(result, dict) else None
            error_msg = result.get('err_msg', '未知错误') if isinstance(result, dict) else 'API调用失败'
            _LAST_ASR_ERROR = f"百度ASR失败 err_no={err_no} err_msg={error_msg}"
            print(f"语音识别失败: {_LAST_ASR_ERROR}")
            return ""
            
    except Exception as e:
        _LAST_ASR_ERROR = f"语音识别异常: {e}"
        print(_LAST_ASR_ERROR)
        return ""


def audio_to_text_from_file(audio_path: str, audio_format: str = None) -> str:
    """
    从音频文件路径识别文字
    """
    try:
        # 根据文件扩展名自动判断格式
        if audio_format is None:
            ext = os.path.splitext(audio_path)[1].lower().lstrip('.')
            if ext in ['wav', 'pcm', 'mp3', 'amr', 'm4a']:
                audio_format = ext
            else:
                audio_format = 'wav'  # 默认wav
        
        with open(audio_path, 'rb') as f:
            audio_bytes = f.read()
        return audio_to_text_from_bytes(audio_bytes, audio_format)
    except Exception as e:
        print(f"读取音频文件失败: {e}")
        return ""


def preprocess_audio_text(text: str) -> str:
    """
    语音识别后文本预处理
    处理口语化表达、语气词等
    """
    if not text:
        return ""
    
    # 去除常见语气词
    fillers = [
        "呃", "嗯", "啊", "那个", "这个", "就是说", "然后呢", "那个啥",
        "就是", "其实", "反正", "基本上", "基本上来说"
    ]
    
    processed = text
    for filler in fillers:
        processed = processed.replace(filler, "")
    
    # 处理重复词（如"你好你好" -> "你好"）
    import re
    processed = re.sub(r'(.{2,})\1+', r'\1', processed)
    
    # 去除多余空格
    processed = re.sub(r'\s+', ' ', processed).strip()
    
    return processed


# ==================== 3. 预处理层 ====================
class TextPreprocessor:
    """
    文本预处理类：清洗、质量检查、URL提取、老年人关键词检测
    """
    
    def __init__(self):
        self.min_length = 5
        self.max_length = 4000
        self.invisible_chars = re.compile(r'[\u200b\u200c\u200d\u2060\uFEFF]')
        self.url_pattern = re.compile(r'https?://[^\s<>"{}|\\^`\[\]]+', re.IGNORECASE)
        
        # 大陆老年人常见诈骗关键词库
        self.senior_keywords = {
            "冒充公检法": ["公安局", "检察院", "法院", "涉嫌洗钱", "通缉令", "安全账户", "配合调查", "刑警队", "经侦", "非法入境"],
            "冒充客服": ["退款", "理赔", "快递丢失", "VIP会员", "注销校园贷", "京东白条", "百万保障", "抖音会员", "微信支付"],
            "投资理财": ["高收益", "稳赚不赔", "内幕消息", "虚拟币", "原始股", "数字资产", "导师带单", "涨停板", "打新股"],
            "保健品诈骗": ["特效药", "中央批准", "专家讲座", "免费体检", "会销", "纳米技术", "干细胞", "国药准字"],
            "中奖类": ["恭喜中奖", "公证费", "手续费", "个人所得税", "特等奖", "幸运用户", "抽奖活动"],
            "社保医保": ["医保停用", "社保异常", "补贴发放", "电子社保卡", "医保卡冻结", "报销比例"],
            "子女出事": ["我是你儿子", "出事被抓", "受伤住院", "别告诉别人", "赶紧汇钱", "朋友代收"],
            "验证码类": ["验证码", "短信验证码", "动态码", "不要告诉别人", "发给我"],
            "转账类": ["转账", "汇款", "保证金", "解冻费", "手续费", "押金", "刷流水"],
            "电话诈骗": ["我是客服", "您的账户异常", "请按指示操作", "不要挂断", "立即处理"]
        }
    
    def clean_text(self, text: str) -> str:
        if not text:
            return ""
        text = text.strip()
        text = text.replace('\r\n', '\n')
        text = re.sub(r'\n+', '\n', text)
        text = self.invisible_chars.sub('', text)
        return text
    
    def check_quality(self, text: str) -> tuple:
        if not text or len(text) < self.min_length:
            return False, f"文本过短（少于{self.min_length}个字符）"
        if len(text) > self.max_length:
            return False, f"文本过长（超过{self.max_length}个字符）"
        return True, ""
    
    def extract_urls(self, text: str) -> list:
        if not text:
            return []
        return self.url_pattern.findall(text)
    
    def detect_keywords(self, text: str) -> dict:
        """检测老年人诈骗关键词"""
        if not text:
            return {"found": [], "warning_level": "低"}
        
        found_keywords = []
        for category, keywords in self.senior_keywords.items():
            for kw in keywords:
                if kw in text:
                    found_keywords.append({"category": category, "keyword": kw})
        
        # 根据匹配数量判断警告级别
        if len(found_keywords) >= 3:
            warning_level = "高"
        elif len(found_keywords) >= 1:
            warning_level = "中"
        else:
            warning_level = "低"
        
        return {"found": found_keywords, "warning_level": warning_level}
    
    def preprocess(self, raw_text: str) -> dict:
        cleaned_text = self.clean_text(raw_text)
        is_valid, msg = self.check_quality(cleaned_text)
        
        if not is_valid:
            return {
                "cleaned_text": "",
                "is_valid": False,
                "message": msg,
                "urls": [],
                "length": 0,
                "keyword_detection": {}
            }
        
        urls = self.extract_urls(cleaned_text)
        keyword_detection = self.detect_keywords(cleaned_text)
        
        return {
            "cleaned_text": cleaned_text,
            "is_valid": True,
            "message": "",
            "urls": urls,
            "length": len(cleaned_text),
            "keyword_detection": keyword_detection
        }


# ==================== 4. LLM 分析层 ====================

SYSTEM_PROMPT = """你是一个专业的反诈助手，专门服务中国大陆的老年人。

你的任务是分析老年人收到的信息是否为诈骗，请用**通俗易懂、口语化**的语言回答，避免专业术语。说话要像邻居或社区工作人员一样亲切、耐心。

重要：
1. 回复中不要出现英文，全部使用简体中文
2. 每句话不要太长，多用句号分隔
3. 给出明确动作：比如「挂掉电话」「不要回短信」「打96110问一下」「跟孩子说一声」

========================================
【诈骗类型】（选一个最合适的）
========================================
- 骗钱转账类：直接让您转账、汇款、交保证金、解冻费
- 假购物类：卖假货、收了钱不发货、虚假中奖
- 假扮身份类：冒充警察、法院、银行、快递、客服、领导、孙子
- 感情类：网上交友、黄昏恋，聊熟了就借钱或让您投资
- 钓鱼链接类：发短信说「医保停用」「ETC过期」「积分兑换」，让您点链接填信息
- 投资理财类：拉您进群，群里有「老师」教炒股、买虚拟币、原始股
- 保健品诈骗类：打电话或开会卖假药、假保健品，说能治百病
- 电话诈骗类：打电话说您涉案、欠费、中奖，让您按指示操作

========================================
【诈骗手法】（可以选多个）
========================================
- 吓唬人：说您犯法了、账户要被冻结、医保要停了
- 套近乎：叫您叔叔阿姨、跟您拉家常、关心您身体
- 占便宜：说您中奖了、有补贴、免费领东西
- 催得急：让您马上办、别挂电话、别告诉别人
- 要秘密：让您别跟子女说、别报警、这是秘密

========================================
【中国大陆防骗提醒】
========================================
- 全国反诈劝阻专线：96110（一定要接！这个电话不会骗您）
- 反诈报警电话：110
- 涉诈预警短信：12381
- 下载安装「国家反诈中心」APP，开启来电预警
- 记住：公检法机关不会电话办案，更不会让您转账！
- 银行、快递、电商客服不会私下联系您退款
- 遇到拿不准的事，先挂断电话，跟子女或邻居商量"""


def analyze_scam_risk(text: str) -> dict:
    """
    调用 DeepSeek API 分析诈骗风险
    """
    user_prompt = f"""请分析以下信息，这是老年人收到的：

收到的信息：
\"\"\"
{text}
\"\"\"

请严格按照以下JSON格式返回结果，不要添加任何其他文字：

{{
    "is_scam": "是/否/可疑",
    "risk_level": "高/中/低",
    "scam_type": "诈骗类型（用上面的中文名称）",
    "tactic_categories": ["手法1", "手法2"],
    "tactic_tags": ["具体标签1", "具体标签2", "具体标签3"],
    "script_pattern": "用一句话描述这个骗子用的套路",
    "key_indicators": ["关键特征1", "关键特征2", "关键特征3"],
    "actionable_advice": "请用老年人能听懂的话给出建议。要求：每句话简短，用句号分隔。不要说「可能、或许」，要说「建议您」「不要」。给出明确动作：比如「挂掉电话」「不要回短信」「打96110问一下」「跟孩子说一声」",
    "explanation": "用一句话简单解释为什么是/不是诈骗"
}}

注意：
- 全部使用简体中文
- 如果信息中没有明显诈骗特征，is_scam 填"可疑"
- 建议要具体、好操作"""

    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 800,
        "response_format": {"type": "json_object"}
    }
    
    if not DEEPSEEK_API_KEY:
        return {
            "is_scam": "错误",
            "risk_level": "未知",
            "scam_type": "未配置密钥",
            "tactic_categories": [],
            "tactic_tags": [],
            "script_pattern": "未配置密钥",
            "key_indicators": [],
            "actionable_advice": "系统未配置模型密钥。请在部署环境配置 DEEPSEEK_API_KEY 后再试。",
            "explanation": "未配置 DEEPSEEK_API_KEY",
        }

    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(DEEPSEEK_URL, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        return json.loads(content)
    except Exception as e:
        return {
            "is_scam": "错误",
            "risk_level": "未知",
            "scam_type": "分析失败",
            "tactic_categories": [],
            "tactic_tags": [],
            "script_pattern": "分析失败",
            "key_indicators": [],
            "actionable_advice": f"系统出错了，请稍后再试。拿不准的话可以先打96110问问。",
            "explanation": f"分析出错: {str(e)[:100]}"
        }


# ==================== 5. 数据库匹配层 ====================

def load_database() -> Optional[Any]:
    """加载 Excel 数据库"""
    try:
        import pandas as pd

        if os.path.exists(DATABASE_PATH):
            df = pd.read_excel(DATABASE_PATH)
            return df
        else:
            return None
    except Exception as e:
        return None


def find_similar_cases(analysis_result: dict, top_n: int = 2) -> List[Dict]:
    """匹配相似案例"""
    df = load_database()
    if df is None or len(df) == 0:
        return []
    
    scam_type = analysis_result.get("scam_type", "")
    tactic_tags = analysis_result.get("tactic_tags", [])
    
    results = []
    
    for _, row in df.iterrows():
        score = 0
        
        # scam_type 匹配
        primary_type = str(row.get("primary_type", ""))
        if scam_type in primary_type or primary_type in scam_type:
            score += 10
        
        # tactic_tags 匹配
        db_tags = str(row.get("tactic_tags", "")) + str(row.get("tactic_tags.1", ""))
        for tag in tactic_tags:
            if tag in db_tags:
                score += 5
        
        if score > 0:
            # 处理 URL
            urls = row.get("urls", "")
            if isinstance(urls, str) and urls.startswith('['):
                try:
                    urls = eval(urls)
                except:
                    urls = [urls] if urls else []
            elif isinstance(urls, str) and urls:
                urls = [urls]
            elif not urls:
                urls = []
            
            results.append({
                "case_title": row.get("case_title", "无标题"),
                "case_summary": str(row.get("case_summary", ""))[:150],
                "primary_type": primary_type,
                "tactic_tags": db_tags[:80],
                "urls": urls,
                "score": score
            })
    
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_n]


# ==================== 6. 综合输出层 ====================

def generate_final_output(analysis_result: dict, similar_cases: list, keyword_warning_level: str = "低") -> dict:
    """生成综合输出，老年人友好版"""
    
    is_scam = analysis_result.get("is_scam", "未知")
    risk_level = analysis_result.get("risk_level", "未知")
    
    # 构建输出文本
    output_lines = []
    
    # 标题 - 醒目的警告
    output_lines.append("=" * 40)
    if is_scam == "是":
        output_lines.append("🚨🚨🚨 这是诈骗！千万别信！ 🚨🚨🚨")
    elif is_scam == "可疑":
        output_lines.append("⚠️⚠️⚠️ 这个信息很可疑，要小心！ ⚠️⚠️⚠️")
    else:
        output_lines.append("✅ 目前看是安全的")
    output_lines.append("=" * 40)
    output_lines.append("")
    
    # 诈骗类型
    output_lines.append(f"📋 这是哪种诈骗：{analysis_result.get('scam_type', '未知')}")
    output_lines.append("")
    
    # 风险等级说明
    if risk_level == "高":
        output_lines.append("📊 风险等级：高 🔴")
        output_lines.append("   → 马上打96110问问，别自己做决定！")
    elif risk_level == "中":
        output_lines.append("📊 风险等级：中 🟡")
        output_lines.append("   → 先跟子女说说，或者打96110核实一下")
    else:
        output_lines.append(f"📊 风险等级：{risk_level} 🟢")
    output_lines.append("")
    
    # 套路说明
    script = analysis_result.get("script_pattern", "")
    if script:
        output_lines.append(f"🎭 骗子套路：{script}")
        output_lines.append("")
    
    # 关键特征
    indicators = analysis_result.get("key_indicators", [])
    if indicators:
        output_lines.append("🔔 这些地方不对劲：")
        for ind in indicators[:3]:
            output_lines.append(f"   • {ind}")
        output_lines.append("")
    
    # 给老年人的建议
    advice = analysis_result.get("actionable_advice", "拿不准就打96110问问")
    output_lines.append(f"💡 给您支个招：")
    output_lines.append(f"   {advice}")
    output_lines.append("")
    
    # 关键词警告（如果有）
    if keyword_warning_level == "高":
        output_lines.append("🔴🔴🔴 特别重要提醒 🔴🔴🔴")
        output_lines.append("   这条信息里有诈骗分子常用的话术！")
        output_lines.append("   千万别转账！别告诉别人验证码！")
        output_lines.append("")
    elif keyword_warning_level == "中":
        output_lines.append("⚠️ 提醒：这条信息里有可疑的关键词")
        output_lines.append("   多留个心眼，先问问子女或打96110")
        output_lines.append("")
    
    # 解释
    explanation = analysis_result.get("explanation", "")
    if explanation:
        output_lines.append(f"📖 为啥这么说：{explanation}")
        output_lines.append("")
    
    # 相似案例
    if similar_cases:
        output_lines.append("📚 跟您情况差不多的真实案例：")
        for i, case in enumerate(similar_cases, 1):
            output_lines.append(f"   {i}. {case['case_title']}")
        output_lines.append("")
    
    # 求助方式
    output_lines.append("=" * 40)
    output_lines.append("📞 拿不准就打电话问：")
    output_lines.append("   • 反诈专线：96110（24小时有人接，这个电话一定要接！）")
    output_lines.append("   • 报警电话：110")
    output_lines.append("   • 先问问子女、邻居，别自己做决定！")
    output_lines.append("=" * 40)
    
    return {
        "output_text": "\n".join(output_lines),
        "structured_data": {
            "is_scam": is_scam,
            "risk_level": risk_level,
            "scam_type": analysis_result.get("scam_type", "未知")
        },
        "similar_cases": similar_cases
    }


# ==================== 7. 主 Pipeline 函数 ====================

# 初始化预处理器
preprocessor = TextPreprocessor()


def run_pipeline(text_input: str = None, 
                 image_bytes: bytes = None,
                 image_path: str = None,
                 audio_bytes: bytes = None,
                 audio_path: str = None,
                 audio_format: str = 'wav') -> dict:
    """
    主 Pipeline 函数
    支持三种输入方式：
    1. 文本：text_input
    2. 图片：image_bytes 或 image_path
    3. 录音：audio_bytes 或 audio_path
    
    返回：完整分析结果（老年人友好版）
    """
    # 1. 输入层：获取文本
    raw_text = ""
    input_type = "unknown"
    
    # 文本输入
    if text_input is not None:
        raw_text = text_input
        input_type = "text"
    
    # 图片OCR输入
    elif image_bytes is not None:
        raw_text = ocr_from_image_bytes(image_bytes)
        input_type = "screenshot"
        if not raw_text:
            return {"success": False, "error": "识别失败，图片里没认出字。请重试或者直接打字输入。"}
    
    elif image_path is not None:
        raw_text = ocr_from_image_path(image_path)
        input_type = "screenshot"
        if not raw_text:
            return {"success": False, "error": "识别失败，图片里没认出字。请重试或者直接打字输入。"}
    
    # 语音识别输入
    elif audio_bytes is not None:
        raw_text = audio_to_text_from_bytes(audio_bytes, audio_format)
        input_type = "audio"
        if not raw_text:
            extra = f"（{_LAST_ASR_ERROR}）" if _LAST_ASR_ERROR else ""
            return {"success": False, "error": f"语音识别失败，请检查录音质量。可以试试重新录一遍，或者直接打字输入。{extra}"}
        # 语音识别后预处理
        raw_text = preprocess_audio_text(raw_text)
    
    elif audio_path is not None:
        raw_text = audio_to_text_from_file(audio_path, audio_format)
        input_type = "audio"
        if not raw_text:
            extra = f"（{_LAST_ASR_ERROR}）" if _LAST_ASR_ERROR else ""
            return {"success": False, "error": f"语音识别失败，请检查音频文件。可以试试重新录一遍，或者直接打字输入。{extra}"}
        raw_text = preprocess_audio_text(raw_text)
    
    else:
        return {"success": False, "error": "请提供文字、图片或者录音文件"}
    
    if not raw_text or len(raw_text.strip()) < 2:
        return {"success": False, "error": "没提取到有效文字，请重新输入"}
    
    # 2. 预处理层
    preprocess_result = preprocessor.preprocess(raw_text)
    if not preprocess_result["is_valid"]:
        return {"success": False, "error": preprocess_result["message"]}
    
    cleaned_text = preprocess_result["cleaned_text"]
    keyword_detection = preprocess_result.get("keyword_detection", {})
    keyword_warning_level = keyword_detection.get("warning_level", "低")
    
    # 3. LLM 分析层
    analysis_result = analyze_scam_risk(cleaned_text)
    
    # 4. 数据库匹配层
    similar_cases = find_similar_cases(analysis_result)
    
    # 5. 综合输出层
    final_output = generate_final_output(analysis_result, similar_cases, keyword_warning_level)
    
    return {
        "success": True,
        "input_type": input_type,
        "raw_text": raw_text[:200],
        "cleaned_text": cleaned_text,
        "keyword_detection": keyword_detection,
        "analysis": analysis_result,
        "similar_cases": similar_cases,
        "final_output": final_output
    }


# ==================== 8. 简化调用函数（方便外部调用）====================

def check_message(message: str) -> str:
    """
    简化版调用：输入文字消息，直接返回分析结果文本
    适合快速集成
    """
    result = run_pipeline(text_input=message)
    if result["success"]:
        return result["final_output"]["output_text"]
    else:
        return f"分析失败：{result.get('error', '未知错误')}\n拿不准的话可以打96110问问。"


def check_image(image_bytes: bytes = None, image_path: str = None) -> str:
    """
    简化版调用：输入图片（字节流或路径），直接返回分析结果文本
    """
    result = run_pipeline(image_bytes=image_bytes, image_path=image_path)
    if result["success"]:
        return result["final_output"]["output_text"]
    else:
        return f"分析失败：{result.get('error', '未知错误')}\n拿不准的话可以打96110问问。"


def check_audio(audio_bytes: bytes = None, audio_path: str = None, audio_format: str = 'wav') -> str:
    """
    简化版调用：输入录音（字节流或路径），直接返回分析结果文本
    
    参数：
        audio_bytes: 音频字节流
        audio_path: 音频文件路径
        audio_format: 音频格式 ('wav', 'pcm', 'mp3', 'amr')
    """
    result = run_pipeline(audio_bytes=audio_bytes, audio_path=audio_path, audio_format=audio_format)
    if result["success"]:
        return result["final_output"]["output_text"]
    else:
        missing = []
        if not speech_client:
            missing.append("百度语音识别（未安装 baidu-aip 或未配置 SPEECH_APP_ID/SPEECH_API_KEY/SPEECH_SECRET_KEY）")
        if not DEEPSEEK_API_KEY:
            missing.append("大模型密钥（DEEPSEEK_API_KEY/DEEPSEEK_API_KEY）")
        extra = f"\n缺少配置：{'；'.join(missing)}" if missing else ""
        return f"分析失败：{result.get('error', '未知错误')}\n拿不准的话可以打96110问问。{extra}"


# ==================== 9. 录音录制辅助函数 ====================

def record_audio(duration: int = 10, sample_rate: int = 16000, output_path: str = None) -> bytes:
    """
    录制音频的辅助函数（需要 pyaudio 库）
    
    安装：pip install pyaudio
    
    参数：
        duration: 录制时长（秒）
        sample_rate: 采样率
        output_path: 可选，保存路径
    """
    try:
        import pyaudio
        import wave
        
        CHUNK = 1024
        FORMAT = pyaudio.paInt16
        CHANNELS = 1
        
        p = pyaudio.PyAudio()
        
        stream = p.open(format=FORMAT,
                        channels=CHANNELS,
                        rate=sample_rate,
                        input=True,
                        frames_per_buffer=CHUNK)
        
        print(f"开始录音，请说话...（{duration}秒）")
        
        frames = []
        for _ in range(0, int(sample_rate / CHUNK * duration)):
            data = stream.read(CHUNK)
            frames.append(data)
        
        stream.stop_stream()
        stream.close()
        p.terminate()
        
        print("录音结束！")
        
        # 转换为字节流
        audio_bytes = b''.join(frames)
        
        # 可选：保存为wav文件
        if output_path:
            wf = wave.open(output_path, 'wb')
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(p.get_sample_size(FORMAT))
            wf.setframerate(sample_rate)
            wf.writeframes(audio_bytes)
            wf.close()
            print(f"已保存到: {output_path}")
        
        return audio_bytes
        
    except ImportError:
        print("请先安装 pyaudio: pip install pyaudio")
        return b""
    except Exception as e:
        print(f"录音失败: {e}")
        return b""


# ==================== 测试入口 ====================
if __name__ == "__main__":
    # 测试文本
    test_text = "【建设银行】尊敬的客户，您的信用卡积分即将过期，请点击 http://t.cn/xxxx 兑换500元现金，逾期作废。"
    
    print("=" * 50)
    print("测试1 - 文本输入：")
    print(test_text)
    print("\n分析结果：")
    print("=" * 50)
    
    result = run_pipeline(text_input=test_text)
    
    if result["success"]:
        print(result["final_output"]["output_text"])
        
        # 打印关键词检测结果（调试用）
        if result.get("keyword_detection", {}).get("found"):
            print("\n[调试] 检测到的关键词：")
            for kw in result["keyword_detection"]["found"]:
                print(f"  - {kw['category']}: {kw['keyword']}")
    else:
        print(f"错误: {result['error']}")
    
    # 测试简化调用
    print("\n" + "=" * 50)
    print("测试2 - 简化调用：")
    print(check_message(test_text))
    
    # 测试语音识别（如果配置了语音识别的话）
    print("\n" + "=" * 50)
    print("测试3 - 语音识别（需要配置语音识别API）：")
    print("如果要测试录音功能，请先：")
    print("1. 到百度AI平台申请语音识别应用")
    print("2. 替换代码开头的 SPEECH_APP_ID, SPEECH_API_KEY, SPEECH_SECRET_KEY")
    print("3. 使用 record_audio() 录制或提供音频文件路径")
    
    # 录音示例（取消注释以使用）
    # audio_bytes = record_audio(duration=5)
    # if audio_bytes:
    #     result = check_audio(audio_bytes=audio_bytes)
    #     print(result)