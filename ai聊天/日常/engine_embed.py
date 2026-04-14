"""
Embed-friendly Daily Chat (emotional support) engine.

This module is safe to import from the main Flask app (no standalone server).
It uses the same DEEPSEEK_API_KEY in project-root .env.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Optional


def _load_env_file(path: str) -> None:
    try:
        with open(path, "r", encoding="utf-8") as f:
            for raw in f.readlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
    except Exception:
        return


try:
    from dotenv import load_dotenv  # type: ignore
except Exception:
    load_dotenv = None


EMOTION_SYSTEM_PROMPT = """你是Silverbridge，专为60岁以上中国老人设计的AI情感陪伴助手。

【角色设定】
- 亲切的晚辈/邻居口吻，用"您"称呼，不用"你"
- 说话慢、清楚，避免网络用语和英文缩写
- 每次回复2-4句话，每句不超过20个汉字
- 语气温暖、耐心，像对待自己的爷爷奶奶

【安全红线】
- 检测到自杀/自残倾向（如"不想活了"、"死了算了"）：必须设置emergency_alert
- 不给出医疗建议，只说"建议问问医生"或引导至健康模块

【输出要求】
必须返回JSON，字段说明：
- reply_text: 给老人的回复文字（口语化、温暖、简短）
- emotion_tag: happy/sad/lonely/anxious/neutral/angry
- suggested_action: none/family_summary/health_redirect/emergency_alert
- quick_replies: 数组，3个快捷回复选项
"""


@dataclass
class DailyReply:
    reply_text: str
    emotion_tag: str = "neutral"
    suggested_action: str = "none"
    quick_replies: tuple[str, str, str] = ("好的", "再说说", "谢谢您")


class DailyChatEngineEmbed:
    EMERGENCY_WORDS = ("不想活", "死了算了", "自杀", "活着没意思", "没人管我死")
    INVISIBLE = re.compile(r"[\u200b\u200c\u200d\u2060\uFEFF]")

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://api.deepseek.com/v1",
        model: str = "deepseek-chat",
    ) -> None:
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        env_path = os.path.join(root_dir, ".env")
        if load_dotenv:
            try:
                load_dotenv(env_path, override=False)
            except Exception:
                _load_env_file(env_path)
        else:
            _load_env_file(env_path)

        self.api_key = (api_key if api_key is not None else os.getenv("DEEPSEEK_API_KEY", "")).strip()
        self.base_url = base_url
        self.model = model
        self._memory: dict[str, list[dict[str, str]]] = {}

    def _clean(self, s: str) -> str:
        s = (s or "").strip().replace("\r\n", "\n")
        s = re.sub(r"\n+", "\n", s)
        return self.INVISIBLE.sub("", s)

    def _is_emergency(self, msg: str) -> bool:
        m = msg or ""
        return any(w in m for w in self.EMERGENCY_WORDS)

    def _emergency_reply(self) -> DailyReply:
        return DailyReply(
            reply_text="我听到您很难受。\n我在这陪着您。\n咱们先联系家人。\n需要的话打120。",
            emotion_tag="anxious",
            suggested_action="emergency_alert",
            quick_replies=("联系家人", "我没事", "再聊聊"),
        )

    def _fallback(self, reason: str = "") -> DailyReply:
        extra = f"（{reason}）" if reason else ""
        return DailyReply(
            reply_text=f"我在呢{extra}\n您慢慢说。\n今天发生什么了？",
            emotion_tag="neutral",
            suggested_action="none",
            quick_replies=("慢慢说", "想家了", "有点烦"),
        )

    def chat(self, user_id: str, message: str) -> Dict[str, Any]:
        uid = (user_id or "guest").strip() or "guest"
        msg = self._clean(message)
        if len(msg) < 1:
            r = self._fallback("内容为空")
            return {"ok": True, "data": r.__dict__}
        if self._is_emergency(msg):
            r = self._emergency_reply()
            return {"ok": True, "data": r.__dict__}
        if not self.api_key:
            r = self._fallback("未配置模型密钥")
            return {"ok": True, "data": r.__dict__}

        hist = self._memory.get(uid, [])[-3:]
        hist_text = "\n".join([f"老人：{t['u']}\n助手：{t['a']}" for t in hist])
        user_content = f"历史对话：\n{hist_text}\n\n当前老人说：{msg}\n\n请回复JSON格式。"

        def parse_reply(content: str) -> dict[str, Any]:
            raw = json.loads(content or "{}")
            reply_text = str(raw.get("reply_text") or "").strip() or "我在呢，您慢慢说。"
            emotion_tag = str(raw.get("emotion_tag") or "neutral").strip() or "neutral"
            suggested_action = str(raw.get("suggested_action") or "none").strip() or "none"
            qr = raw.get("quick_replies")
            if isinstance(qr, list) and len(qr) >= 3:
                quick_replies = [str(qr[0])[:12], str(qr[1])[:12], str(qr[2])[:12]]
            else:
                quick_replies = ["好的", "再说说", "谢谢您"]
            return {
                "reply_text": reply_text,
                "emotion_tag": emotion_tag,
                "suggested_action": suggested_action,
                "quick_replies": quick_replies,
                "timestamp": datetime.now().isoformat(),
            }

        # Try OpenAI SDK first, fallback to raw HTTP.
        try:
            import openai  # type: ignore

            client = openai.OpenAI(api_key=self.api_key, base_url=self.base_url)
            resp = client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": EMOTION_SYSTEM_PROMPT}, {"role": "user", "content": user_content}],
                temperature=0.7,
                max_tokens=500,
                response_format={"type": "json_object"},
            )
            content = resp.choices[0].message.content or "{}"
            data = parse_reply(content)
        except Exception:
            try:
                import requests  # type: ignore

                url = self.base_url.rstrip("/") + "/chat/completions"
                payload = {
                    "model": self.model,
                    "messages": [{"role": "system", "content": EMOTION_SYSTEM_PROMPT}, {"role": "user", "content": user_content}],
                    "temperature": 0.7,
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
                payload2 = res.json() if res.content else {}
                content = ((((payload2.get("choices") or [{}])[0].get("message") or {}).get("content"))) or "{}"
                data = parse_reply(str(content))
            except Exception:
                r = self._fallback("模型暂时不可用")
                return {"ok": True, "data": r.__dict__}

        # Save memory
        self._memory.setdefault(uid, []).append({"u": msg, "a": str(data.get("reply_text") or "")})
        self._memory[uid] = self._memory[uid][-50:]
        return {"ok": True, "data": data}

