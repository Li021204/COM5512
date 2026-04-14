"""
Embed-friendly Health Consultation engine.

This module is designed to be imported by the main Silverbridge Flask app
without starting its own Flask server or background schedulers.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, Optional

try:
    from dotenv import load_dotenv  # type: ignore
except Exception:  # pragma: no cover
    load_dotenv = None

def _load_env_file(path: str) -> None:
    """
    Minimal .env loader (KEY=VALUE per line).
    Only sets keys that are not already present in os.environ.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            for raw in f.readlines():
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if not k:
                    continue
                if k not in os.environ:
                    os.environ[k] = v
    except Exception:
        # Silent by design: missing .env should not break the app.
        return


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
"""


DEFAULT_RISK_WARNING = "以上内容只是健康科普哦，要是您有不舒服，一定要及时去医院找医生看看哈。"


class TextPreprocessor:
    def __init__(self) -> None:
        self.min_length = 2
        self.max_length = 500
        self.invisible_chars = re.compile(r"[\u200b\u200c\u200d\u2060\uFEFF]")

    def clean_text(self, text: str) -> str:
        if not text:
            return ""
        text = text.strip().replace("\r\n", "\n")
        text = re.sub(r"\n+", "\n", text)
        return self.invisible_chars.sub("", text)

    def validate(self, text: str) -> tuple[bool, str]:
        if not text or len(text) < self.min_length:
            return False, f"文本过短（少于{self.min_length}个字符）"
        if len(text) > self.max_length:
            return False, f"文本过长（超过{self.max_length}个字符）"
        return True, ""

    def preprocess(self, raw_text: str) -> dict[str, Any]:
        cleaned = self.clean_text(raw_text)
        ok, msg = self.validate(cleaned)
        return {"cleaned_text": cleaned, "is_valid": ok, "message": msg}


@dataclass
class HealthReply:
    simple_reply: str
    full_reply: str
    risk_warning: str = DEFAULT_RISK_WARNING


class HealthConsultationEngineEmbed:
    """
    Minimal chat engine for embedding into the main app.

    - Uses DeepSeek-compatible OpenAI API if DEEPSEEK_API_KEY is set.
    - If missing credentials, returns a safe fallback reply.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://api.deepseek.com/v1",
        model: str = "deepseek-chat",
    ) -> None:
        # Load env vars from project-root .env (import-safe).
        # Prefer python-dotenv if available; otherwise use our minimal loader.
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        env_path = os.path.join(root_dir, ".env")
        if load_dotenv:
            try:
                load_dotenv(env_path, override=False)
            except Exception:
                _load_env_file(env_path)
        else:
            _load_env_file(env_path)
        self.pre = TextPreprocessor()
        self.api_key = (api_key if api_key is not None else os.getenv("DEEPSEEK_API_KEY", "")).strip()
        self.base_url = base_url
        self.model = model

    def _fallback(self, reason: str = "") -> HealthReply:
        extra = f"（{reason}）" if reason else ""
        return HealthReply(
            simple_reply=f"我先帮您理清楚{extra}".strip(),
            full_reply="您先把不舒服的地方说清楚：哪里不舒服、多久了、有没有发烧。\n如果疼得厉害或胸闷气短，请马上打120。",
            risk_warning=DEFAULT_RISK_WARNING,
        )

    def chat(self, user_id: str, message: str) -> Dict[str, Any]:
        p = self.pre.preprocess(message)
        if not p["is_valid"]:
            r = self._fallback(p.get("message") or "输入不完整")
            return {"ok": True, "data": r.__dict__}

        cleaned = str(p["cleaned_text"] or "")

        if not self.api_key:
            r = self._fallback("未配置模型密钥")
            return {"ok": True, "data": r.__dict__}

        def parse_reply(content: str) -> Dict[str, str]:
            raw = json.loads(content or "{}")
            simple = str(raw.get("simple_reply") or "").strip() or "我先帮您理清楚"
            full = str(raw.get("full_reply") or "").strip() or "您先把不舒服的地方说清楚：哪里不舒服、多久了。"
            risk = str(raw.get("risk_warning") or "").strip() or DEFAULT_RISK_WARNING
            return {"simple_reply": simple, "full_reply": full, "risk_warning": risk}

        try:
            # Preferred: OpenAI SDK (DeepSeek compatible)
            import openai  # type: ignore

            client = openai.OpenAI(api_key=self.api_key, base_url=self.base_url)
            resp = client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": HEALTH_SYSTEM_PROMPT},
                    {"role": "user", "content": f"用户ID：{user_id}\n老人说：{cleaned}\n\n请返回JSON。"},
                ],
                temperature=0.3,
                max_tokens=500,
                response_format={"type": "json_object"},
            )
            content = resp.choices[0].message.content or "{}"
            return {"ok": True, "data": parse_reply(content)}
        except Exception:
            # Fallback: raw HTTP via requests (no openai dependency)
            try:
                import requests  # type: ignore

                url = self.base_url.rstrip("/") + "/chat/completions"
                payload = {
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": HEALTH_SYSTEM_PROMPT},
                        {"role": "user", "content": f"用户ID：{user_id}\n老人说：{cleaned}\n\n请返回JSON。"},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 500,
                    "response_format": {"type": "json_object"},
                }
                res = requests.post(
                    url,
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json=payload,
                    timeout=25,
                )
                if res.status_code == 401:
                    r = self._fallback("API Key 无效")
                    return {"ok": True, "data": r.__dict__}
                if not res.ok:
                    r = self._fallback(f"模型请求失败（HTTP {res.status_code}）")
                    return {"ok": True, "data": r.__dict__}

                data = res.json() if res.content else {}
                content = (
                    (((data or {}).get("choices") or [{}])[0].get("message") or {}).get("content")  # type: ignore[union-attr]
                ) or "{}"
                if not str(content).strip() or str(content).strip() == "{}":
                    r = self._fallback("模型返回为空")
                    return {"ok": True, "data": r.__dict__}
                return {"ok": True, "data": parse_reply(str(content))}
            except Exception:
                r = self._fallback("模型暂时不可用")
                return {"ok": True, "data": r.__dict__}

