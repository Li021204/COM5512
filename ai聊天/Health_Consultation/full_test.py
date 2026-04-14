import requests
import json

# 固定配置（如果改了端口，把5002改成你的端口）
BASE_URL = "http://127.0.0.1:5002"
# 测试用的用户ID（随便写，用来区分不同老人）
TEST_USER_ID = "test_elder_001"

print("="*60)
print("🧪 Silverbridge 健康模块 全功能测试")
print("="*60)

# ==================== 测试1：服务连通性（必测，第一个测） ====================
print("\n1️⃣ 【测试1】服务健康检查")
try:
    res = requests.get(f"{BASE_URL}/health/check")
    # 格式化打印结果
    print("✅ 测试成功！结果：")
    print(json.dumps(res.json(), ensure_ascii=False, indent=2))
except Exception as e:
    print(f"❌ 测试失败！错误：{e}")
    print("💡 排查：服务有没有启动？终端有没有关？端口对不对？")

# ==================== 测试2：核心健康问答功能（核心必测） ====================
print("\n" + "="*60)
print("\n2️⃣ 【测试2】核心健康问答功能")
# 测试用的问题，可以换成你Excel里的任意问题
test_question = "高血压每天能吃多少盐？"
try:
    # 构造请求数据
    data = {
        "user_id": TEST_USER_ID,
        "message": test_question
    }
    res = requests.post(f"{BASE_URL}/health/chat", json=data)
    print(f"✅ 测试成功！你问的问题：{test_question}")
    print("机器人回复：")
    print(json.dumps(res.json(), ensure_ascii=False, indent=2))
except Exception as e:
    print(f"❌ 测试失败！错误：{e}")

# ==================== 测试3：健康画像功能（必测） ====================
print("\n" + "="*60)
print("\n3️⃣ 【测试3】健康画像更新&读取")
try:
    # 构造老人的健康信息
    data = {
        "user_id": TEST_USER_ID,
        "profile_info": {
            "chronic_disease": ["高血压", "糖尿病"],
            "age": 75,
            "common_medication": ["硝苯地平", "二甲双胍"],
            "allergies": ["青霉素"]
        }
    }
    res = requests.post(f"{BASE_URL}/health/update-profile", json=data)
    print("✅ 测试成功！画像更新结果：")
    print(json.dumps(res.json(), ensure_ascii=False, indent=2))
except Exception as e:
    print(f"❌ 测试失败！错误：{e}")

# ==================== 测试4：带健康画像的问答（必测） ====================
print("\n" + "="*60)
print("\n4️⃣ 【测试4】带健康画像的精准问答")
test_question = "我能吃咸菜吗？"
try:
    data = {
        "user_id": TEST_USER_ID,
        "message": test_question
    }
    res = requests.post(f"{BASE_URL}/health/chat", json=data)
    print(f"✅ 测试成功！你问的问题：{test_question}")
    print("机器人（结合高血压画像）回复：")
    print(json.dumps(res.json(), ensure_ascii=False, indent=2))
except Exception as e:
    print(f"❌ 测试失败！错误：{e}")

# ==================== 测试5：居家应急场景功能（必测） ====================
print("\n" + "="*60)
print("\n5️⃣ 【测试5】居家应急场景（摔倒）")
test_emergency_msg = "我摔倒了"
try:
    data = {
        "user_id": TEST_USER_ID,
        "message": test_emergency_msg
    }
    res = requests.post(f"{BASE_URL}/health/chat", json=data)
    print(f"✅ 测试成功！你输入的内容：{test_emergency_msg}")
    print("机器人应急回复：")
    print(json.dumps(res.json(), ensure_ascii=False, indent=2))
except Exception as e:
    print(f"❌ 测试失败！错误：{e}")

# 你可以替换成其他应急场景测试：
# 比如："我烫伤了"、"我胸口疼"、"我东西卡喉咙了"

# ==================== 测试6：慢病管理-记录日常指标 ====================
print("\n" + "="*60)
print("\n6️⃣ 【测试6】慢病管理-记录血压指标")
try:
    data = {
        "user_id": TEST_USER_ID,
        "type": "blood_pressure",  # 血压，测血糖就写 blood_sugar
        "value": "140/90"  # 血压值，血糖就写 7.5
    }
    res = requests.post(f"{BASE_URL}/health/record-vital", json=data)
    print("✅ 测试成功！指标记录结果：")
    print(json.dumps(res.json(), ensure_ascii=False, indent=2))
except Exception as e:
    print(f"❌ 测试失败！错误：{e}")

# ==================== 测试7：慢病管理-获取专属小贴士 ====================
print("\n" + "="*60)
print("\n7️⃣ 【测试7】慢病管理-获取专属小贴士")
try:
    data = {
        "user_id": TEST_USER_ID
    }
    res = requests.post(f"{BASE_URL}/health/chronic-tip", json=data)
    print("✅ 测试成功！专属小贴士：")
    print(json.dumps(res.json(), ensure_ascii=False, indent=2))
except Exception as e:
    print(f"❌ 测试失败！错误：{e}")

# ==================== 测试8：慢病管理-设置用药提醒 ====================
print("\n" + "="*60)
print("\n8️⃣ 【测试8】慢病管理-设置用药提醒")
try:
    data = {
        "user_id": TEST_USER_ID,
        "time": "08:00",  # 提醒时间，24小时制
        "medicine": "硝苯地平",  # 药名
        "note": "早餐后温水送服"  # 备注
    }
    res = requests.post(f"{BASE_URL}/health/set-reminder", json=data)
    print("✅ 测试成功！用药提醒设置结果：")
    print(json.dumps(res.json(), ensure_ascii=False, indent=2))
except Exception as e:
    print(f"❌ 测试失败！错误：{e}")

# ==================== 测试9：每日摘要生成功能 ====================
print("\n" + "="*60)
print("\n9️⃣ 【测试9】生成每日健康摘要（给子女）")
try:
    data = {
        "user_id": TEST_USER_ID,
        "date": "2026-04-12"  # 今天的日期，也可以不填，默认今天
    }
    res = requests.post(f"{BASE_URL}/health/daily-summary", json=data)
    print("✅ 测试成功！每日摘要结果：")
    print(json.dumps(res.json(), ensure_ascii=False, indent=2))
except Exception as e:
    print(f"❌ 测试失败！错误：{e}")

# ==================== 测试10：OCR检查单解读功能（可选） ====================
print("\n" + "="*60)
print("\n🔟 【测试10】OCR检查单解读（可选）")
# 注意：先把一张体检单/医嘱的截图，放在同一个文件夹里，命名为 test_report.jpg
try:
    # 打开图片文件
    with open("test_report.jpg", "rb") as f:
        files = {"image": f}
        # 传user_id
        data = {"user_id": TEST_USER_ID}
        res = requests.post(f"{BASE_URL}/health/interpret-report", files=files, data=data)
        print("✅ 测试成功！检查单解读结果：")
        print(json.dumps(res.json(), ensure_ascii=False, indent=2))
except FileNotFoundError:
    print("⚠️ 跳过测试：没找到 test_report.jpg 图片文件")
except Exception as e:
    print(f"❌ 测试失败！错误：{e}")

print("\n" + "="*60)
print("🎉 所有测试执行完成！")
print("="*60)