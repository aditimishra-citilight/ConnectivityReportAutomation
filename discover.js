// Discovery: for each in-scope city, fetch CCMS(1)/ILC(2)/Gateway(10) totals, list
// warehouses from geography, so we can map the sheet's rows to device types.
const axios = require("axios");
const https = require("https");
const { CREDENTIALS, SERVERS } = require("./cities.config");
const { login, fetchList, fetchGeography } = require("./lib");
const agent = new https.Agent({ rejectUnauthorized: false });
const UA = "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/149.0.0.0 Mobile Safari/537.36";

async function gateway(server, sid, cityId) {
  const path = server.gatewayPath || (server.listPath.includes("/smartlight/") ? "/smartlight/getDeviceList_V2" : "/getDeviceList_V2");
  const res = await axios.post(server.base + path,
    { cityId: Number(cityId), deviceType: "10", zoneName: "0", wardName: "0", streetName: "0", userId: server.userId },
    { httpsAgent: agent, timeout: 60000, headers: { "Content-Type": "application/json", Cookie: `JSESSIONID=${sid}`, Origin: server.base, "X-Requested-With": "XMLHttpRequest", "User-Agent": UA } });
  return Array.isArray(res.data) ? res.data : (res.data && res.data.data) || [];
}
const cnt = async (fn) => { try { return (await fn()).length; } catch (e) { return "ERR:" + e.message.slice(0, 20); } };

const SCOPE = {
  ndmc: [["City",3],["SP",2],["Rohini",7],["Narela",6],["Civil Lines",4],["Karol Bagh",5]],
  velociti: [["GCBOT",11],["KG BOT",21],["Nalanda",31],["Bhopal",48],["JD",57],["Puri",64]],
  kdmc: [["KDMC",2]],
  bhatinda: [["Bhatinda",52]],
};

(async () => {
  for (const [skey, srv] of Object.entries(SERVERS)) {
    const sid = await login(srv, CREDENTIALS);
    const geo = await fetchGeography(srv, sid).catch(() => []);
    console.log(`\n===== ${skey} =====`);
    for (const [name, cityId] of SCOPE[skey]) {
      const ccms = await cnt(() => fetchList(srv, sid, cityId, "1"));
      const ilc  = await cnt(() => fetchList(srv, sid, cityId, "2"));
      const gw   = await cnt(() => gateway(srv, sid, cityId));
      console.log(`  ${name.padEnd(13)} (id ${cityId})  CCMS=${ccms}  ILC=${ilc}  GW=${gw}`);
    }
    // warehouses / related cities for this server
    const wh = geo.filter((c) => /WAREHOUSE/i.test(c.cityName || ""));
    if (wh.length) {
      console.log("  -- warehouses on this server --");
      for (const c of wh) {
        const ilc = await cnt(() => fetchList(srv, sid, c.cityId, "2"));
        console.log(`     ${(c.cityName||"").padEnd(22)} id=${c.cityId}  ILC=${ilc}`);
      }
    }
  }
})().catch((e) => console.error("FATAL", e.message));
