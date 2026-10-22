/* 诗签 Poem Lots: shake the bamboo cup, draw a slip with a classical couplet and
   a developer's "do / avoid" reading. Saves as an image. */
import { download, emit, glyph, h, reducedMotion } from "./util.js";
import { lang, t } from "./i18n.js";

const POEMS = [
  { lines: ["问渠那得清如许", "为有源头活水来"], by: "朱熹《观书有感》", en: "Why is the pond so clear? Fresh water flows in from the source." },
  { lines: ["欲穷千里目", "更上一层楼"], by: "王之涣《登鹳雀楼》", en: "To see a thousand miles further, climb one more floor." },
  { lines: ["会当凌绝顶", "一览众山小"], by: "杜甫《望岳》", en: "From the very summit, every other mountain looks small." },
  { lines: ["长风破浪会有时", "直挂云帆济沧海"], by: "李白《行路难》", en: "A day will come to ride the wind across the sea." },
  { lines: ["山重水复疑无路", "柳暗花明又一村"], by: "陆游《游山西村》", en: "No way through, it seemed, until the next village appeared." },
  { lines: ["海内存知己", "天涯若比邻"], by: "王勃《送杜少府之任蜀州》", en: "With a true friend, the far end of the world is next door." },
  { lines: ["行到水穷处", "坐看云起时"], by: "王维《终南别业》", en: "Walk to where the stream ends, then sit and watch the clouds rise." },
  { lines: ["千磨万击还坚劲", "任尔东西南北风"], by: "郑燮《竹石》", en: "Struck a thousand times, still firm, whichever way the wind blows." },
  { lines: ["纸上得来终觉浅", "绝知此事要躬行"], by: "陆游《冬夜读书示子聿》", en: "What you read stays shallow; to know it, do it yourself." },
  { lines: ["沉舟侧畔千帆过", "病树前头万木春"], by: "刘禹锡《酬乐天扬州初逢席上见赠》", en: "Past the sunken boat a thousand sails go by." },
  { lines: ["不畏浮云遮望眼", "自缘身在最高层"], by: "王安石《登飞来峰》", en: "No cloud can block the view when you stand on the top floor." },
  { lines: ["春风得意马蹄疾", "一日看尽长安花"], by: "孟郊《登科后》", en: "In the spring wind, see every flower of the capital in a day." },
  { lines: ["莫愁前路无知己", "天下谁人不识君"], by: "高适《别董大》", en: "Fear no lonely road ahead; the whole world will know you." },
  { lines: ["两岸猿声啼不住", "轻舟已过万重山"], by: "李白《早发白帝城》", en: "While the gibbons still call, the light boat has passed ten thousand hills." },
  { lines: ["采菊东篱下", "悠然见南山"], by: "陶渊明《饮酒·其五》", en: "Picking chrysanthemums by the fence, I see the southern hills, at ease." },
  { lines: ["小荷才露尖尖角", "早有蜻蜓立上头"], by: "杨万里《小池》", en: "The lotus bud has barely shown, and a dragonfly already stands on it." },
  { lines: ["横看成岭侧成峰", "远近高低各不同"], by: "苏轼《题西林壁》", en: "A ridge from the front, a peak from the side; every view differs." },
  { lines: ["人生得意须尽欢", "莫使金樽空对月"], by: "李白《将进酒》", en: "When life goes well, enjoy it; never leave the cup empty under the moon." }
];

const LEVELS = [{ zh: "上上签", en: "Best fortune" }, { zh: "上签", en: "Good fortune" }, { zh: "中签", en: "Fair fortune" }];

const DO = [
  { zh: "把前后端放进一个图标", en: "put frontend and backend in one icon" },
  { zh: "写一份 app.json", en: "write an app.json" },
  { zh: "先看计划，再动手", en: "read the plan before running it" },
  { zh: "提交代码", en: "commit your work" },
  { zh: "给仓库加 topic", en: "add a topic to your repo" },
  { zh: "喝杯茶再部署", en: "have tea, then deploy" },
  { zh: "让健康检查说了算", en: "trust the health check" },
  { zh: "写清楚 README", en: "write a clear README" },
  { zh: "开源", en: "open-source it" }
];
const AVOID = [
  { zh: "手动记端口", en: "memorising ports" },
  { zh: "一口气开十个终端", en: "ten terminals at once" },
  { zh: "周五下午部署", en: "deploying on Friday afternoon" },
  { zh: "跳过健康检查", en: "skipping health checks" },
  { zh: "硬编码 localhost:3000", en: "hard-coding localhost:3000" },
  { zh: "只开前端不开后端", en: "starting only the frontend" },
  { zh: "在生产环境试命令", en: "trying commands in production" },
  { zh: "把密钥写进代码", en: "committing secrets" }
];

const choose = (list) => list[Math.floor(Math.random() * list.length)];

export function mountPoem(body) {
  const cup = h("div", { class: "poem-cup", "aria-hidden": "true" },
    ...Array.from({ length: 9 }, (_, i) => h("i", { class: `poem-stick s${i}` })),
    h("span", { class: "poem-cup-body" }, "签"));
  const draw = h("button", { type: "button", class: "button primary" }, glyph("sparkle"), t("poem.draw"));
  const save = h("button", { type: "button", class: "button secondary", hidden: true }, glyph("download"), t("poem.save"));
  const result = h("div", { class: "poem-result", role: "status", "aria-live": "polite" },
    h("p", { class: "poem-empty", text: t("poem.empty") }));
  let current = null;

  draw.addEventListener("click", async () => {
    draw.disabled = true;
    if (!reducedMotion.matches) {
      await cup.animate([{ transform: "rotate(0)" }, { transform: "rotate(-12deg)" }, { transform: "rotate(10deg)" }, { transform: "rotate(-8deg)" }, { transform: "rotate(6deg)" }, { transform: "rotate(0)" }],
        { duration: 900, easing: "ease-in-out" }).finished.catch(() => {});
    }
    current = { poem: choose(POEMS), level: choose(LEVELS), good: choose(DO), bad: choose(AVOID), no: 1 + Math.floor(Math.random() * 99) };
    render();
    draw.disabled = false;
    draw.replaceChildren(glyph("refresh"), t("poem.again"));
    save.hidden = false;
    emit("poem:drawn", {});
  });
  save.addEventListener("click", () => {
    if (!current) return;
    image(current).toBlob((blob) => blob && download(blob, "vibe-poem-lot.png"), "image/png");
  });

  function render() {
    const { poem, level, good, bad, no } = current;
    const card = h("article", { class: "poem-card" },
      h("p", { class: "poem-no", text: lang === "zh" ? `第 ${no} 签` : `Lot No. ${no}` }),
      h("span", { class: "poem-seal", text: level.zh }),
      h("div", { class: "poem-lines", lang: "zh-CN" }, poem.lines.map((line) => h("p", { text: line }))),
      h("p", { class: "poem-by", text: poem.by }),
      lang === "en" ? h("p", { class: "poem-en", text: poem.en }) : null,
      h("dl", { class: "poem-reading" },
        h("div", {}, h("dt", { text: t("poem.do") }), h("dd", { text: good[lang] || good.en })),
        h("div", {}, h("dt", { text: t("poem.avoid") }), h("dd", { text: bad[lang] || bad.en }))),
      lang === "en" ? h("p", { class: "poem-level-en", text: level.en }) : null);
    result.replaceChildren(card);
    if (!reducedMotion.matches) card.animate([{ opacity: 0, transform: "translateY(40px) rotate(-4deg)" }, { opacity: 1, transform: "none" }], { duration: 520, easing: "cubic-bezier(.2,.9,.3,1.2)" });
  }

  body.append(h("div", { class: "poem" },
    h("div", { class: "poem-side" }, cup, h("p", { class: "poem-hint", text: t("poem.hint") }), h("div", { class: "sim-controls" }, draw, save)),
    result));
  return {};
}

function image({ poem, level, good, bad, no }) {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1080;
  const c = canvas.getContext("2d");
  const serif = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif';
  c.fillStyle = "#f2ecdf";
  c.fillRect(0, 0, 720, 1080);
  for (let i = 0; i < 6000; i++) {
    c.fillStyle = `rgba(120, 96, 60, ${Math.random() * 0.07})`;
    c.fillRect(Math.random() * 720, Math.random() * 1080, 1.5, 1.5);
  }
  c.strokeStyle = "#b8402c";
  c.lineWidth = 4;
  c.strokeRect(36, 36, 648, 1008);
  c.fillStyle = "#1c1a1e";
  c.textAlign = "center";
  c.font = `500 30px ${serif}`;
  c.fillText(`第 ${no} 签`, 360, 110);
  c.font = `700 64px ${serif}`;
  const [first, second] = poem.lines;
  const column = (text, x) => [...text].forEach((ch, i) => c.fillText(ch, x, 220 + i * 76));
  column(first, 430);
  column(second, 290);
  c.font = `400 26px ${serif}`;
  c.fillStyle = "#4a4448";
  c.fillText(poem.by, 360, 860);
  c.fillText(`宜 ${good.zh}　·　忌 ${bad.zh}`, 360, 920);
  c.font = `400 22px ${serif}`;
  c.fillText("vibedesktop.online", 360, 1000);
  c.fillStyle = "rgba(190, 52, 34, 0.9)";
  c.fillRect(560, 150, 84, 150);
  c.fillStyle = "#f6ead6";
  c.font = `700 34px ${serif}`;
  [...level.zh].forEach((ch, i) => c.fillText(ch, 602, 200 + i * 42));
  return canvas;
}
