import { cloud } from "spectrum-ts";
import { config } from "./config.ts";

/** Prints the Photon plan, line type and number(s) so you know what to add to the group chat. */
const id = config.spectrumProjectId;
const secret = config.spectrumProjectSecret;
const project = await cloud.getProject(id, secret);
const sub = await cloud.getSubscription(id).catch((e) => ({ error: String(e) }));
const info = await cloud.getImessageInfo(id).catch((e) => ({ error: String(e) }));
console.log("project:", project.name, `(${project.slug})`);
console.log("subscription:", sub);
console.log("iMessage line:", info);
const tokens = await cloud.issueImessageTokens(id, secret).catch((e) => ({ error: String(e) }));
if ("numbers" in tokens) console.log("numbers:", tokens.numbers);
else if ("type" in tokens) console.log("token type:", tokens.type, "(shared pool; numbers are assigned per conversation)");
else console.log("tokens:", tokens);
