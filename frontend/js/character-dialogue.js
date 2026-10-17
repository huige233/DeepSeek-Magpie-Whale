(function (DSW) {
  "use strict";
  // Fictional companion dialogue, independent of the user's saved custom lines.
  const profiles = {
    "Claude-Chibi": {
      idle: ["书签夹好了，陪你慢慢想。", "把难题拆成小段，像翻书一样。", "窗边有光，今天也适合写点什么。", "这朵小花，是今天的灵感书签。"],
      pat: ["轻一点，花瓣会害羞的。", "这一下，就当作写完一页的奖励。"],
      shy: ["别一直看我……书都忘了翻。", "脸热热的，不是夕阳的缘故。"],
      angry: ["书签都被你戳歪啦！", "暂停一下，我的小花要抗议了。"],
      warn: ["慢一点，给我留点翻页的时间。", "再戳就把你写进调皮名单。"],
      lonely: ["书翻到这一页，想等你一起读。", "椅子旁边的位置，给你留着。"],
      return: ["你回来啦，我们接着这一页。", "书签没有动，一直等着你。"],
      feed: ["先合上书，认真吃这一口。", "米饭的香气比书签先到了。"],
      fed: ["吃饱了，空盆放好再翻页。", "谢谢款待，今天的故事有米香。"],
      exhausted: ["先夹好书签，休息一会儿吧。", "眼皮有点沉，下一页稍后再读。"]
    },
    "GLM-Chibi": {
      idle: ["小铃铛响一声，今日开工！", "把大任务拆开，一格一格完成。", "狐耳已竖好，有新点子就叫我。", "先检查，再打勾，稳稳地来。"],
      pat: ["耳朵会痒啦，轻轻摸就好。", "收到摸头奖励，小铃铛加班响！"],
      shy: ["耳朵竖起来，不代表我不害羞。", "你再看，铃铛都要乱响了。"],
      angry: ["狐耳不是连点测试按钮！", "停！我的铃铛要报错啦。"],
      warn: ["慢一点，别把耳朵戳成感叹号。", "再戳，我就抱着铃铛躲开啦。"],
      lonely: ["清单写好了，还缺你一个打勾。", "铃铛安静好久啦，你在忙吗？"],
      return: ["叮！搭档归队。", "耳朵听见你回来啦！"],
      feed: ["开饭也是清单里的重要一项！", "叮当一响，米饭到场。"],
      fed: ["吃饭完成，空盆待整理！", "补给收到，铃铛又有精神啦。"],
      exhausted: ["小狐耳暂时趴下，歇一会儿。", "给清单加一项：现在休息。"]
    },
    "GPT-Chibi": {
      idle: ["白龙值班中，我们一步一步来。", "先理清线索，再决定往哪儿走。", "龙角负责可爱，草稿负责思考。", "不着急，复杂的事也能慢慢拆开。"],
      pat: ["摸头可以，龙角要轻拿轻放。", "这一摸，今天的精神又多一点。"],
      shy: ["龙也会脸红，请不要记笔记。", "刚刚想好的话……突然忘掉了。"],
      angry: ["龙角不是按钮，不许连点！", "白龙也有一点点小脾气。"],
      warn: ["轻一点，小龙正在认真站岗。", "再戳就要收到龙式瞪眼了。"],
      lonely: ["路线画好了，等你一起出发。", "桌角有条小白龙，还在这里。"],
      return: ["欢迎回来，继续结伴前进。", "白龙归队，下一步由你决定。"],
      feed: ["第一步，张嘴；第二步，吃饭。", "这份白饭，是小龙的宝藏。"],
      fed: ["任务完成：米饭清空，铁盆保留。", "小龙吃饱啦，空盆别忘了收。"],
      exhausted: ["小龙需要打个盹，稍后再出发。", "把草稿放好，我们先休息。"]
    },
    "Grok-Chibi": {
      idle: ["小恶魔今天只捣一点点乱。", "别紧张，我只是路过你的桌角。", "这顶小皇冠，今天也很神气。", "灵感没来？先给它留个座位。"],
      pat: ["可以摸，但不许弄歪我的皇冠。", "哼，勉强批准这次摸头。"],
      shy: ["谁脸红了？是屏幕太暖！", "别笑，我的小翅膀都僵住了。"],
      angry: ["再戳，皇冠要给你记一笔！", "小恶魔宣布：现在不许捣乱。"],
      warn: ["喂喂，调皮名额今天归我。", "再连点，我可要瞪你了。"],
      lonely: ["没有搭档，恶作剧都不好玩。", "小翅膀收起来，等你回来。"],
      return: ["哼，总算想起桌角的小恶魔啦。", "搭档到场，今天继续不太乖。"],
      feed: ["这碗饭就当作上贡啦，啊呜！", "先吃饭，再计划一点点捣乱。"],
      fed: ["饭归我，空盆可没被我吃掉。", "吃饱！今天少捣一次乱好了。"],
      exhausted: ["皇冠先放稳，小恶魔要打盹。", "捣乱电量不足，休息一下。"]
    },
    "Qwen-Chibi": {
      idle: ["扇子轻摇，陪你理一理思绪。", "千言万语，不如先写下第一句。", "别急，答案也需要一点留白。", "一盏茶的工夫，想一个小点子。"],
      pat: ["轻些，发辫刚刚整理好。", "这一下，便当作今日的夸奖。"],
      shy: ["容我借扇子，遮一遮脸。", "话到嘴边，倒先红了脸。"],
      angry: ["再戳，扇子可要合上了。", "发饰都歪了，得好好说理！"],
      warn: ["慢些，莫把摸头变成敲木鱼。", "给发辫留一点安静，好吗？"],
      lonely: ["扇面上的花，都等得安静了。", "留了半句话，想等你接下去。"],
      return: ["你来得正好，续上这半句话。", "扇子一开，又见故人。"],
      feed: ["收好小扇，先尝一口米香。", "千般滋味，白饭也有它的好。"],
      fed: ["米饭吃尽，铁盆留待下回。", "承蒙款待，这顿很是满足。"],
      exhausted: ["合扇歇片刻，不必事事赶。", "倦意上来了，先留一点空白。"]
    },
    "Gemini-Chibi": {
      idle: ["一只眼看星星，一只眼看新点子！", "猫耳雷达，发现今天的小惊喜。", "把两个想法碰一碰，会有火花吗？", "星星发夹就位，准备一起探索！"],
      pat: ["摸摸收到，猫耳开心地竖起来！", "轻一点，别碰掉我的小星星。"],
      shy: ["两只眼睛都不知道该看哪里啦。", "猫耳发热，是不是星星太近了？"],
      angry: ["猫耳不是开关，不可以连按！", "星星也要皱眉啦，停一下！"],
      warn: ["慢慢摸，猫耳会抗议的。", "再戳，我就把星星藏起来。"],
      lonely: ["今天的星星，想找你一起数。", "猫耳转了一圈，还没等到你。"],
      return: ["你回来啦！小星星又亮起来了。", "双眼锁定搭档，欢迎归队！"],
      feed: ["星星不能吃，白饭可以！啊呜！", "猫耳先歇歇，嘴巴开始工作。"],
      fed: ["白饭清空，空盆变成新玩具！", "吃饱啦，继续收集小惊喜。"],
      exhausted: ["猫耳垂下来啦，想打个小盹。", "星星暂时休息，我们也歇一下。"]
    },
    "Kimi-Chibi": {
      idle: ["月亮还没来，我先陪你一会儿。", "把想法排成音符，慢慢往下写。", "眼镜擦好了，今天也认真听。", "笛子安静放好，不打扰你专心。"],
      pat: ["轻轻的就好，别碰歪眼镜。", "这个摸头，像一枚柔软的音符。"],
      shy: ["眼镜后面，也藏不住脸红吗？", "笛子先抱紧，话等一下再说。"],
      angry: ["眼镜都歪啦，不许再连戳。", "休止符！现在要暂停一下。"],
      warn: ["慢一点，别打乱我的小节拍。", "再戳，月亮也要皱眉啦。"],
      lonely: ["这一小节，想等你来再继续。", "月亮走了一点，你还没回来。"],
      return: ["你回来了，旋律可以继续了。", "空着的这一拍，终于等到你。"],
      feed: ["笛子先放好，认真吃一口饭。", "米香到了，给旋律加个休止符。"],
      fed: ["饭吃完啦，空盆轻轻放好。", "谢谢这顿饭，接着陪你听风。"],
      exhausted: ["眼镜有点沉，先闭眼听一会儿。", "今天的旋律，暂时停在这里。"]
    }
  };
  let enabled = true;
  let overrides = {};
  const previous = new Map();
  function lines(kind) {
    const group=DSW.flags?.widgetBody;
    if(!enabled||!Object.hasOwn(profiles,group||""))return undefined;
    const custom=overrides[group]?.[kind];
    return Array.isArray(custom)&&custom.length?custom:profiles[group]?.[kind];
  }
  function pick(kind, fallback) {
    const choices = lines(kind);
    if (!choices?.length) return fallback;
    const key = DSW.flags.widgetBody + ":" + kind;
    const last = previous.get(key);
    let index = DSW.flags.dialogueMode === "carousel" ? ((last ?? -1) + 1) % choices.length : Math.floor(Math.random() * choices.length);
    if (choices.length > 1 && index === last) index = (index + 1) % choices.length;
    previous.set(key, index);
    return choices[index];
  }
  function configure(settings) { enabled = settings?.characterDialogue !== false; overrides=settings?.characterLines||{};previous.clear(); }
  DSW.characters = { lines, pick, configure, profiles };
  DSW.invoke?.("get_companion_settings").then(configure).catch(() => {});
  window.__TAURI__?.event?.listen("companion-settings-changed", e => configure(e.payload));
})(window.DSW=window.DSW||{});
