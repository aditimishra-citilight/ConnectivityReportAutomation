// Inspect raw record shape for a given server/cityId/deviceType.
// Usage: node inspect.js <server> <cityId> <deviceType>
const { CREDENTIALS, SERVERS } = require("./cities.config");
const { login, fetchList } = require("./lib");

const [server, cityId, deviceType] = [process.argv[2] || "ndmc", process.argv[3] || "3", process.argv[4] || "1"];

(async () => {
  const srv = SERVERS[server];
  const sid = await login(srv, CREDENTIALS);
  const devices = await fetchList(srv, sid, cityId, deviceType);
  console.log(`${server} cityId=${cityId} deviceType=${deviceType} -> ${devices.length} devices`);
  if (!devices.length) return;
  console.log("\nKeys of first record:");
  console.log(Object.keys(devices[0]).join(", "));
  console.log("\nFirst 2 records:");
  console.log(JSON.stringify(devices.slice(0, 2), null, 2));
  // print any field that looks like a date/time across first record
  console.log("\nTime-ish fields in first 3 records:");
  for (const d of devices.slice(0, 3)) {
    const t = {};
    for (const [k, v] of Object.entries(d)) {
      if (/time|date|update|seen|last|comm/i.test(k)) t[k] = v;
    }
    console.log(JSON.stringify(t));
  }
})().catch((e) => console.error("ERR", e.message));
