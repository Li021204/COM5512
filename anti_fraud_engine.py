from __future__ import annotations

import json
import os
import re
import importlib.util
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests


ROOT = Path(__file__).resolve().parent
KB_PATH = ROOT / "ai聊天" / "反诈" / "scam_kb.json"
ANTI_SCAM_NOTEBOOK_PATH = ROOT / "ai聊天" / "反诈" / "Digital Safety (Anti-Scam) System.ipynb"
ANTI_SCAM_PIPELINE_PATH = ROOT / "ai聊天" / "反诈" / "anti_scam_pipeline_5512.py"

_PIPELINE_MOD = None


def _load_pipeline_module():
    global _PIPELINE_MOD
    if _PIPELINE_MOD is not None:
        return _PIPELINE_MOD
    if not ANTI_SCAM_PIPELINE_PATH.exists():
        return None
    spec = importlib.util.spec_from_file_location("anti_scam_pipeline_5512", ANTI_SCAM_PIPELINE_PATH)
    if not spec or not spec.loader:
        return None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[attr-defined]
    _PIPELINE_MOD = mod
    return mod


@dataclass
class AntiFraudReply:
    reply_text: str
    risk_level: str = "中"  # 高/中/低
    is_scam: str = "可疑"  # 是/否/可疑


def _load_kb() -> list[dict[str, Any]]:
    try:
        data = json.loads(KB_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _score_hits(text: str, keywords: list[str]) -> int:
    t = text
    score = 0
    for k in keywords:
        if not k:
            continue
        if k in t:
            score += 2
    # crude URL/phone/OTP signals
    if re.search(r"https?://|www\.", t):
        score += 2
    if re.search(r"\b\d{6}\b", t):  # OTP-like
        score += 2
    if re.search(r"\+?\d[\d\s-]{7,}\d", t):
        score += 1
    if any(w in t for w in ["立刻", "马上", "紧急", "最后一天", "过期"]):
        score += 1
    return score


def _heuristic_analyze(text: str) -> AntiFraudReply:
    kb = _load_kb()
    best = None
    best_score = -1
    for item in kb:
        score = _score_hits(text, list(item.get("keywords", [])))
        if score > best_score:
            best = item
            best_score = score

    if best_score <= 1:
        return AntiFraudReply(
            reply_text=(
                "我先帮您判断一下：这条信息目前偏“可疑”。\n"
                "您先别点链接、别转账、别给验证码。\n"
                "把对方要求您做的事再发我一句，我帮您逐条核实。"
            ),
            risk_level="低",
            is_scam="可疑",
        )

    tips = best.get("tips", [])
    tips_text = "\n".join([f"- {t}" for t in tips[:3]])
    return AntiFraudReply(
        reply_text=(
            f"我初步判断：这条信息很可能与「{best.get('scam_type_cn','诈骗')}」有关。\n"
            f"建议您这样做：\n{tips_text}\n"
            "如果在香港，也可以拨打 18222 咨询。"
        ),
        risk_level="高" if best_score >= 4 else "中",
        is_scam="是" if best_score >= 4 else "可疑",
    )


SYSTEM_PROMPT = """你是一个专业的数字安全反诈助手，专门服务香港地区的人们。
你的任务是分析用户收到的信息是否为诈骗，并给出清晰、可操作的建议，适合老人理解。
输出要求：用简短中文分点说明，不要使用复杂术语。必要时提醒 18222。
"""


def _load_deepseek_config() -> tuple[str, str, str] | None:
    """
    Returns (api_key, url, model) if available.

    Priority:
    1) Environment variables
    2) Notebook config (Digital Safety (Anti-Scam) System.ipynb)
    """
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    url = os.getenv("DEEPSEEK_URL", "").strip()
    model = os.getenv("DEEPSEEK_MODEL", "").strip()

    if api_key:
        if not url:
            url = "https://api.deepseek.com/v1/chat/completions"
        if not model:
            model = "deepseek-chat"
        return api_key, url, model

    try:
        raw = ANTI_SCAM_NOTEBOOK_PATH.read_text(encoding="utf-8", errors="ignore")
        m_key = re.search(r'DEEPSEEK_API_KEY\s*=\s*"([^"]+)"', raw)
        m_url = re.search(r'DEEPSEEK_URL\s*=\s*"([^"]+)"', raw)
        m_model = re.search(r'"model"\s*:\s*"([^"]*deepseek[^"]*)"', raw, flags=re.IGNORECASE)
        api_key2 = m_key.group(1).strip() if m_key else ""
        url2 = m_url.group(1).strip() if m_url else "https://api.deepseek.com/v1/chat/completions"
        model2 = (m_model.group(1).strip() if m_model else "deepseek-chat") or "deepseek-chat"
        if api_key2:
            return api_key2, url2, model2
    except Exception:
        pass

    return None


def _deepseek_analyze(text: str) -> AntiFraudReply | None:
    cfg = _load_deepseek_config()
    if not cfg:
        return None
    api_key, url, model = cfg

    user_prompt = (
        "请分析以下信息是否为诈骗，并给出：\n"
        "1) 风险等级（高/中/低）\n"
        "2) 关键特征（3条以内）\n"
        "3) 具体建议（3条以内，老人能听懂）\n"
        "信息内容如下：\n"
        f"\"\"\"\n{text}\n\"\"\"\n"
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 600,
    }

    r = requests.post(url, json=payload, headers={"Authorization": f"Bearer {api_key}"}, timeout=25)
    r.raise_for_status()
    data = r.json()
    content = (
        (data.get("choices") or [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    content = str(content or "").strip()
    if not content:
        return None

    # Try to extract risk level hint; default to "中".
    risk = "中"
    if "高" in content:
        risk = "高"
    elif "低" in content:
        risk = "低"

    is_scam = "可疑" if risk != "低" else "否"
    if risk == "高":
        is_scam = "是"

    return AntiFraudReply(reply_text=content, risk_level=risk, is_scam=is_scam)


def _reply_from_pipeline_result(r: dict) -> AntiFraudReply | None:
    if not isinstance(r, dict) or not r.get("success"):
        return None
    analysis = r.get("analysis", {}) or {}
    final_output = r.get("final_output", {}) or {}
    out_text = str((final_output.get("output_text") or "")).strip()
    if not out_text:
        return None
    risk = str(analysis.get("risk_level") or "中")
    is_scam = str(analysis.get("is_scam") or "可疑")
    return AntiFraudReply(reply_text=out_text, risk_level=risk, is_scam=is_scam)


def analyze(text: str, image_bytes: bytes | None = None) -> AntiFraudReply:
    text = str(text or "").strip()
    if not text and not image_bytes:
        return AntiFraudReply(reply_text="您把可疑短信/来电内容粘贴过来，我帮您判断。", risk_level="低", is_scam="可疑")

    pipeline_path_ok = ANTI_SCAM_PIPELINE_PATH.exists()
    mod = _load_pipeline_module() if pipeline_path_ok else None
    run_pipeline = getattr(mod, "run_pipeline", None) if mod else None

    # 「诈骗识别」统一走 anti_scam_pipeline_5512.run_pipeline（OCR + 预处理 + LLM + 案例库 + 模板输出）
    if callable(run_pipeline):
        try:
            r = run_pipeline(text_input=text if text else None, image_bytes=image_bytes)
            if isinstance(r, dict):
                ok = _reply_from_pipeline_result(r)
                if ok:
                    return ok
                err = r.get("error")
                if err:
                    return AntiFraudReply(
                        reply_text=str(err),
                        risk_level="低",
                        is_scam="可疑",
                    )
        except Exception as e:
            return AntiFraudReply(
                reply_text=f"反诈流水线（anti_scam_pipeline_5512）执行出错，请稍后重试。{str(e)[:160]}",
                risk_level="低",
                is_scam="可疑",
            )
        return AntiFraudReply(
            reply_text="分析未返回有效正文。请换一张更清晰的截图，或把短信全文打字发给我。",
            risk_level="低",
            is_scam="可疑",
        )

    if pipeline_path_ok:
        return AntiFraudReply(
            reply_text="已找到 anti_scam_pipeline_5512.py，但未能加载 run_pipeline。请检查脚本是否完整后重启服务。",
            risk_level="低",
            is_scam="可疑",
        )

    return AntiFraudReply(
        reply_text=(
            f"未找到反诈流水线文件：{ANTI_SCAM_PIPELINE_PATH}\n"
            "请确认路径正确后重启服务。"
        ),
        risk_level="低",
        is_scam="可疑",
    )

