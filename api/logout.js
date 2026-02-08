import { clearCookie, json } from "./_lib.js";

export default function handler(req, res){
  clearCookie(res, "session");
  return json(res, 200, { ok:true });
}