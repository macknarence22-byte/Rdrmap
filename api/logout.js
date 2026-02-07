export default function handler(req, res){
  res.setHeader("Set-Cookie", [
    "rp_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" + (process.env.NODE_ENV==="production" ? "; Secure" : "")
  ]);
  return res.status(200).json({ ok:true });
}
