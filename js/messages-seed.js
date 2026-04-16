(() => {
  const USER_KEY = "currentUser";
  const MSG_KEY = "messagesByContact";
  const SEEDED_KEY = "seededDocxChats_v1";

  const getUserId = () => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      const u = raw ? JSON.parse(raw) : null;
      const nick = u && u.nickname ? String(u.nickname) : "";
      return nick.trim() || "guest";
    } catch {
      return "guest";
    }
  };

  // Only seed for GROUP1 (as requested)
  const uid = getUserId();
  if (uid !== "GROUP1") return;

  // Avoid re-seeding on every refresh
  try {
    if (localStorage.getItem(SEEDED_KEY) === "1") return;
  } catch {}

  const seed = {
    "儿子": [{"side":"right","text":"儿子，起来了没？今天降温了，记得把厚外套穿上。"},{"side":"left","text":"爸，我知道了，刚出门呢，你也注意点别冻着。"},{"side":"right","text":"嗯，中午别总吃外卖，自己做点热乎的饭。"},{"side":"left","text":"害，今天加班，凑活吃点就行，你别操心我。"},{"side":"right","text":"那你别太累了，晚上早点睡，别熬太晚。"},{"side":"left","text":"知道啦爸，对了，你上次说的腰咋样了？"},{"side":"right","text":"好多了，昨天去社区按了按，舒服多了。"},{"side":"left","text":"那就行，要是疼得厉害就跟我说，我带你去医院。"},{"side":"right","text":"不用不用，小毛病，你忙你的就行。"},{"side":"left","text":"行，那我先忙了，周末我回去看你。"}],
    "女儿": [{"side":"right","text":"闺女，小宝最近幼儿园乖不乖？"},{"side":"left","text":"爸，他可皮了，昨天还把小朋友的玩具抢了。"},{"side":"right","text":"哈哈，小孩子都这样，你别骂他。"},{"side":"left","text":"我哪舍得啊，就是带他一天累得慌。"},{"side":"right","text":"那周末我和你妈过去帮你带两天，你歇歇。"},{"side":"left","text":"不用啦爸，你们也歇着，我能行。"},{"side":"right","text":"没事，我们也想小宝了，正好过去看看。"},{"side":"left","text":"那行吧，那你们过来给我带点你做的酱菜呗，我想吃了。"},{"side":"right","text":"没问题，我给你装一大罐，还有你妈腌的萝卜干。"},{"side":"left","text":"谢谢爸！还是你们最疼我。"}],
    "老伴": [{"side":"right","text":"老婆子，我去菜市场了，你要吃啥？"},{"side":"left","text":"买点菠菜吧，晚上做菠菜鸡蛋汤。"},{"side":"right","text":"行，还有不？要不要买点排骨？"},{"side":"left","text":"别买了，昨天的排骨还没吃完呢，剩了点。"},{"side":"right","text":"哦对，那我忘了，那我就买菠菜和豆腐？"},{"side":"left","text":"嗯，对了，你记得把降压药吃了，别又忘了。"},{"side":"right","text":"知道了，我出门前刚吃了，放心吧。"},{"side":"left","text":"那你早点回来，别跟楼下老李下棋下忘了。"},{"side":"right","text":"哪能啊，买完菜就回，顶多跟他说两句话。"},{"side":"left","text":"行，那我在家把粥先熬上。"}],
    "孙子": [{"side":"right","text":"大孙子，最近学习咋样？月考考得好不？"},{"side":"left","text":"爷爷，还行吧，这次数学考了 80 多。"},{"side":"right","text":"不错不错，继续努力，别太累了。"},{"side":"left","text":"知道啦爷爷，对了，我零花钱快没了。"},{"side":"right","text":"哦，我这就给你转，要多少？"},{"side":"left","text":"两百就行，我买点文具，还有跟同学吃个饭。"},{"side":"right","text":"行，转过去了，你看看收到没。"},{"side":"left","text":"收到啦！谢谢爷爷！爷爷你真好！"},{"side":"right","text":"哈哈，放假了就回来，爷爷给你做你爱吃的红烧肉。"},{"side":"left","text":"好嘞！我这周末就回去！"}],
    "孙女": [{"side":"right","text":"囡囡，最近在学校吃的好不好？"},{"side":"left","text":"爷爷，食堂的菜都吃腻了，我都瘦了。"},{"side":"right","text":"瘦了？那你多吃点啊，别减肥，女孩子瘦了不好。"},{"side":"left","text":"哎呀爷爷，我要穿小裙子呢，得瘦点才好看。"},{"side":"right","text":"你这孩子，健康最重要，别瞎饿自己。"},{"side":"left","text":"知道啦，我就是少吃点零食，没事的。"},{"side":"right","text":"那你要是想吃啥跟爷爷说，爷爷给你寄过去。"},{"side":"left","text":"不用啦爷爷，我周末回去吃你做的糖醋排骨就行。"},{"side":"right","text":"没问题，到时候给你做一大盘，管够。"},{"side":"left","text":"耶！爷爷最疼我啦！"}],
    "大哥": [{"side":"right","text":"大哥，最近身体咋样？上次你说的咳嗽好了没？"},{"side":"left","text":"哎，好多了，去医院开了点药，吃了就好了。"},{"side":"right","text":"那就好，你也别太操劳，少干点活。"},{"side":"left","text":"哪能啊，家里那点地，不种闲着也是闲着。"},{"side":"right","text":"那你也注意点，别累着，咱这年纪了，不比年轻时候。"},{"side":"left","text":"知道了，对了，下个月咱妈忌日，你记得不？"},{"side":"right","text":"记得记得，我都记着呢，到时候我过去。"},{"side":"left","text":"行，到时候咱兄弟几个聚聚，一起去看看妈。"},{"side":"right","text":"没问题，到时候我提前过去，帮你忙活忙活。"},{"side":"left","text":"不用不用，你过来就行，别的不用你管。"}],
    "二哥": [{"side":"right","text":"二哥，最近还去公园下棋不？"},{"side":"left","text":"去啊，天天去，昨天还赢了老张好几盘。"},{"side":"right","text":"可以啊，你这棋艺见长啊，啥时候咱俩杀一盘？"},{"side":"left","text":"行啊，周末你过来，咱俩喝点小酒，下一下午。"},{"side":"right","text":"没问题，到时候我带点我刚买的茶叶，你尝尝。"},{"side":"left","text":"行，那我准备点花生米，咱俩好好唠唠。"},{"side":"right","text":"对了，你上次去体检，结果咋样？"},{"side":"left","text":"没啥事，就是血压有点高，医生让少吃盐。"},{"side":"right","text":"那你可得注意，别总吃那么咸，我跟你说，盐吃多了不好。"},{"side":"left","text":"知道了，我这都改了，现在吃的都淡了。"}],
    "亲家公": [{"side":"right","text":"亲家公，最近身体咋样？"},{"side":"left","text":"挺好的，老样子，每天去公园遛遛弯。"},{"side":"right","text":"那就好，我这最近也没啥事，就是腰有点疼。"},{"side":"left","text":"哦？那你可得注意，我之前也这样，去按摩了几次就好了。"},{"side":"right","text":"是啊，我也去社区按了按，好多了。"},{"side":"left","text":"那就行，对了，孩子们最近忙不？"},{"side":"right","text":"忙啊，天天加班，不过周末说要回来吃饭。"},{"side":"left","text":"哦，那挺好，我家那闺女也说想你们了。"},{"side":"right","text":"要不周末你们也过来？咱一起吃个饭，热闹热闹。"},{"side":"left","text":"行啊，那我们过去，我带点我刚腌的鸭蛋，你们尝尝。"}],
    "亲家母": [{"side":"right","text":"亲家母，最近忙啥呢？"},{"side":"left","text":"没啥事，就是在家带带外孙，给他做点好吃的。"},{"side":"right","text":"辛苦你了，那孩子也挺皮的吧？"},{"side":"left","text":"可不是嘛，天天追着他跑，累得我腰都疼。"},{"side":"right","text":"那你也歇歇，别太累了，咱这年纪了。"},{"side":"left","text":"没办法啊，闺女上班忙，我不帮她谁帮她。"},{"side":"right","text":"也是，对了，周末你们过来吃饭不？我做了点好吃的。"},{"side":"left","text":"行啊，正好我也想跟你老伴学学做酱菜呢。"},{"side":"right","text":"没问题，她可会做了，到时候让她教你。"},{"side":"left","text":"那太好了，到时候我早点过去，跟她学学。"}],
    "社区老人关爱群": [{"side":"left","text":"群主 - 王社工：各位叔叔阿姨，下周三社区有免费体检，大家可以报名哦。"},{"side":"right","text":"王社工，我报名，我想去做个体检。"},{"side":"left","text":"张阿姨：我也报名，我最近总头晕，正好查查。"},{"side":"left","text":"群主 - 王社工：好的，我记下来了，到时候早上 8 点到社区医院就行，空腹。"},{"side":"left","text":"李叔叔：哦，空腹啊，那我不能吃早饭了是吧？"},{"side":"left","text":"群主 - 王社工：对的，叔叔，不能吃早饭，也不能喝水。"},{"side":"right","text":"知道了，那我到时候早点过去。"},{"side":"left","text":"赵阿姨：我也报名，我也想去查查。"},{"side":"left","text":"群主 - 王社工：好的，赵阿姨，我记下来了。"},{"side":"right","text":"对了王社工，那个体检都查啥项目啊？"}],
    "社区老人服务群": [{"side":"left","text":"群主 - 李社工：各位叔叔阿姨，要是有需要上门帮忙的，比如修水管，交电费，都可以在群里说。"},{"side":"right","text":"李社工，我家的灯泡坏了，能不能帮忙换一下？"},{"side":"left","text":"群主 - 李社工：可以的叔叔，你什么时候在家？我让师傅过去。"},{"side":"right","text":"我明天上午都在家，你看行不？"},{"side":"left","text":"群主 - 李社工：行，我跟师傅说一下，明天上午 9 点过去。"},{"side":"right","text":"太谢谢你了李社工，麻烦你了。"},{"side":"left","text":"群主 - 李社工：不客气叔叔，这是我们应该做的。"},{"side":"left","text":"孙阿姨：李社工，我想交一下电费，能不能帮我弄一下？"},{"side":"left","text":"群主 - 李社工：可以的孙阿姨，你把电费卡号发给我就行。"},{"side":"right","text":"这个服务真好，省得我们这些老人跑了。"}],
    "多多买菜组团群": [{"side":"left","text":"团长 - 小周：今天的菜到了，大家可以来取了，地址在小区门口超市。"},{"side":"right","text":"小周，我昨天团的菠菜和豆腐，给我留着了吧？"},{"side":"left","text":"团长 - 小周：留着了叔叔，你的在最边上呢，过来拿就行。"},{"side":"left","text":"张阿姨：小周，今天的橘子新鲜不？我昨天团的那个有点酸。"},{"side":"left","text":"团长 - 小周：阿姨，今天的橘子可甜了，刚摘的，你尝尝。"},{"side":"right","text":"哦？那我也团两斤橘子，给我孙子吃。"},{"side":"left","text":"团长 - 小周：行，叔叔，我给你加上，接龙里你排最后。"},{"side":"left","text":"李叔叔：我也团点，给我来三斤。"},{"side":"left","text":"团长 - 小周：好的，都记下来了，明天给大家送过来。"},{"side":"right","text":"太好了，那我明天等你消息。"}],
    "社区老人健身群": [{"side":"left","text":"群主 - 张阿姨：各位老姐妹老哥哥，明天早上 7 点，公园门口打太极，都来啊。"},{"side":"right","text":"张阿姨，我去，我最近腰不好，正好活动活动。"},{"side":"left","text":"李叔叔：我也去，我这几天都没动，浑身难受。"},{"side":"left","text":"群主 - 张阿姨：都来都来，人多热闹，打完太极我们再遛遛弯。"},{"side":"right","text":"行，那我明天早点过去，占个位置。"},{"side":"left","text":"王阿姨：我也去，我最近学了新的动作，到时候教大家。"},{"side":"left","text":"群主 - 张阿姨：太好了，那正好，大家都学学。"},{"side":"right","text":"对了，明天冷不冷？我要不要穿厚点？"},{"side":"left","text":"群主 - 张阿姨：不冷，明天晴天，20 度呢，穿个薄外套就行。"},{"side":"right","text":"行，那我知道了，明天准时到。"}],
    "社区老人活动群": [{"side":"left","text":"群主 - 王社工：各位叔叔阿姨，下周六社区组织去植物园春游，大家报名啊。"},{"side":"right","text":"我报名，我好久没出去转转了。"},{"side":"left","text":"张阿姨：我也报名，我跟我老伴一起去。"},{"side":"left","text":"群主 - 王社工：好的，我记下来了，车费饭费都免费哦。"},{"side":"right","text":"这么好？那太好了，不用我们花钱啊？"},{"side":"left","text":"群主 - 王社工：对的叔叔，社区出钱，就是让大家出去转转。"},{"side":"left","text":"李叔叔：那我也报名，我也想去看看花。"},{"side":"left","text":"群主 - 王社工：好的，都记下来了，到时候早上 8 点在社区门口集合。"},{"side":"right","text":"行，那我到时候准时到，要不要带点水？"},{"side":"left","text":"群主 - 王社工：不用叔叔，我们都准备好了，水和零食都有。"}],
    "社区买菜 送货上门": [{"side":"right","text":"小师傅，我昨天订的菜，什么时候给我送过来？"},{"side":"left","text":"叔叔，我现在在 3 号楼，马上就到你家了，5 分钟。"},{"side":"right","text":"哦，那我在家等着，你上来就行，我门没锁。"},{"side":"left","text":"好的叔叔，我给你放门口？还是给你拿进去？"},{"side":"right","text":"你拿进来吧，我腿脚不方便，没法拿。"},{"side":"left","text":"行，没问题，我马上就到。"},{"side":"right","text":"对了，我订的那个排骨，新鲜不？"},{"side":"left","text":"新鲜的叔叔，今天刚杀的，你放心。"},{"side":"right","text":"那就好，麻烦你了啊。"},{"side":"left","text":"不客气叔叔，马上就到。"}],
    "上门按摩": [{"side":"right","text":"小师傅，我想预约一下明天的按摩，行不行？"},{"side":"left","text":"可以的叔叔，你想约几点的？"},{"side":"right","text":"上午 10 点行不行？我那时候在家。"},{"side":"left","text":"可以的叔叔，我记下来了，明天 10 点过去。"},{"side":"right","text":"对了，我腰不好，你到时候给我多按按腰。"},{"side":"left","text":"没问题叔叔，我知道，上次你也是按腰。"},{"side":"right","text":"哈哈，是啊，老毛病了，按完舒服多了。"},{"side":"left","text":"那你平时也要注意，别久坐，多活动活动。"},{"side":"right","text":"知道了，我记住了，那明天你过来就行。"},{"side":"left","text":"行，叔叔，我明天准时到。"}],
    "社区医生上门问诊": [{"side":"right","text":"李医生，我最近血压有点高，能不能上门给我看看？"},{"side":"left","text":"可以的叔叔，你什么时候在家？我下午过去。"},{"side":"right","text":"我下午都在家，你什么时候来都行。"},{"side":"left","text":"那我下午 3 点过去，给你量量血压，看看用不用调药。"},{"side":"right","text":"太谢谢你了李医生，省得我跑医院了。"},{"side":"left","text":"不客气叔叔，这是我应该做的，你最近有没有按时吃药？"},{"side":"right","text":"吃了，就是昨天量了一下，有点高，150 了。"},{"side":"left","text":"哦，那你别着急，我过去给你看看，最近有没有吃咸的？"},{"side":"right","text":"好像吃了点酱菜，是不是那个的事？"},{"side":"left","text":"有可能，你少吃点，我过去给你看看再说。"}],
    "小李": [{"side":"left","text":"张大爷，我今天去快递站，你有没有快递要拿？"},{"side":"right","text":"有啊小李，我有个快递，尾号 1234，你帮我拿一下呗。"},{"side":"left","text":"没问题大爷，我给你拿了送过去。"},{"side":"right","text":"太谢谢你了小李，每次都麻烦你。"},{"side":"left","text":"不客气大爷，这是我应该做的。"},{"side":"right","text":"对了，你吃饭了没？留下来吃点？"},{"side":"left","text":"不用了大爷，我还有事呢，拿完给你送过去。"},{"side":"right","text":"那太麻烦你了，真是不好意思。"},{"side":"left","text":"没事的大爷，你在家等着就行，我马上到。"},{"side":"right","text":"行，那谢谢你了啊，孩子。"}],
    "小郑": [{"side":"left","text":"张大爷，你这个月水电费交了没？我帮你交？"},{"side":"right","text":"哦，还没呢，我不会弄手机上的，正想去营业厅呢。"},{"side":"left","text":"不用去了大爷，我帮你在手机上交了就行，你把卡号给我。"},{"side":"right","text":"好，我给你找找，哦，是这个，xxxxxx。"},{"side":"left","text":"行，我给你交了，交完了，你看看。"},{"side":"right","text":"这么快？太谢谢你了小郑，省得我跑一趟了。"},{"side":"left","text":"不客气大爷，以后你要交啥都跟我说，我帮你弄。"},{"side":"right","text":"那太好了，我这老了，不会用这些东西。"},{"side":"left","text":"没事的大爷，我帮你，你不用客气。"},{"side":"right","text":"那真是太谢谢你了，孩子，你真是个好人。"}],
    "小冯": [{"side":"right","text":"小冯，我手机怎么连不上网了？你帮我看看？"},{"side":"left","text":"大爷，你是不是把 wifi 关了？我过去给你看看。"},{"side":"right","text":"哦，我不知道啊，我刚才瞎按了一下，就不行了。"},{"side":"left","text":"没事的大爷，我马上过去，5 分钟就到。"},{"side":"right","text":"太谢谢你了小冯，我这手机不会弄，急死我了。"},{"side":"left","text":"别急大爷，小问题，我给你调一下就好。"},{"side":"right","text":"那太好了，那你过来吧，我在家等着。"},{"side":"left","text":"行，我马上到，你别着急。"},{"side":"right","text":"行，麻烦你了啊，孩子。"},{"side":"left","text":"不客气大爷，这都是小事。"}],
    "小吴": [{"side":"left","text":"张大爷，我今天去超市，你有没有要买的？"},{"side":"right","text":"有啊小吴，我想买点降压药，还有那个牛奶，你帮我带一下？"},{"side":"left","text":"没问题大爷，降压药是那个 XX 牌的是吧？"},{"side":"right","text":"对，就是那个，牛奶要纯牛奶，高钙的。"},{"side":"left","text":"行，我知道了，我给你带回来。"},{"side":"right","text":"太谢谢你了小吴，我这腿脚不方便，没法去。"},{"side":"left","text":"没事的大爷，我正好顺路，给你送过去。"},{"side":"right","text":"那我给你转钱，多少钱？"},{"side":"left","text":"不用了大爷，没多少钱，我给你付了就行。"},{"side":"right","text":"那怎么行，我给你转过去，你别跟我客气。"}],
    "小尹": [{"side":"left","text":"张大爷，你上次说的养老金到账了，我帮你查了。"},{"side":"right","text":"哦？到了？太好了，我正想去银行查呢。"},{"side":"left","text":"不用去了大爷，我帮你在手机银行上查了，到了，三千多。"},{"side":"right","text":"这么厉害？那我能不能取出来？"},{"side":"left","text":"可以啊大爷，你要是取现金的话，我陪你去银行取。"},{"side":"right","text":"那太好了，我正好要取点钱买菜。"},{"side":"left","text":"那明天上午我陪你去，行不行？"},{"side":"right","text":"行啊，太谢谢你了小尹，我自己去怕弄不明白。"},{"side":"left","text":"没事的大爷，我陪你，很快就好。"},{"side":"right","text":"那真是太麻烦你了，孩子，谢谢你啊。"}]
  };

  const addTimestamps = (arr, startTs) =>
    arr.map((m, i) => ({ ...m, ts: startTs + i * 60_000 }));

  const loadAll = () => {
    try {
      const raw = localStorage.getItem(MSG_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const saveAll = (all) => {
    try {
      localStorage.setItem(MSG_KEY, JSON.stringify(all));
    } catch {}
  };

  const all = loadAll();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Spread conversations across the last 7 days to make timestamps look natural.
  const contacts = Object.keys(seed);
  contacts.forEach((name, idx) => {
    const key = `${uid}::${name}`;
    if (Array.isArray(all[key]) && all[key].length) return;
    const msgs = seed[name];
    const start = now - (7 - (idx % 7)) * dayMs - msgs.length * 60_000;
    all[key] = addTimestamps(msgs, start);
  });

  saveAll(all);
  try {
    localStorage.setItem(SEEDED_KEY, "1");
  } catch {}

  window.dispatchEvent(new CustomEvent("contacts:updated"));
})();

