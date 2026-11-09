/**
 * Розклад публікацій у Telegram для kyivarbitr.com.ua.
 *
 * Cloudflare запускає цей Worker щогодини (Cron Trigger "0 * * * *").
 * Worker сам рахує час за Києвом (з урахуванням літнього/зимового часу) і
 * о 08, 10, 12, 14, 16, 18 і 20 запускає в GitHub workflow «Новини сайту → Telegram»,
 * який публікує одну нову новину.
 *
 * Потрібен секрет GITHUB_TOKEN: fine-grained token лише для репозиторію
 * kyivarbitr-dev/Kyiv-Arbitr-Site з правом Actions: Read and write.
 */
const REPO = "kyivarbitr-dev/Kyiv-Arbitr-Site";
const WORKFLOW = "news-telegram.yml";
const HOURS = [8, 10, 12, 14, 16, 18, 20];

function kyivHour(date) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv", hour: "2-digit", hourCycle: "h23",
  }).format(date));
}

async function dispatch(env) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "kyivarbitr-tg-scheduler",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (r.status !== 204) {
    throw new Error(`GitHub ${r.status}: ${await r.text()}`);
  }
}

export default {
  async scheduled(event, env, ctx) {
    const hour = kyivHour(new Date(event.scheduledTime));
    if (!HOURS.includes(hour)) return;
    await dispatch(env);
    console.log(`Запущено публікацію новини (${hour}:00 за Києвом)`);
  },
};
