'use client';

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Category = "Të gjitha" | "Ushqim" | "Veshmbathje" | "Shtëpi" | "Elektronikë" | "Fëmijë" | "Libra" | "Të tjera";
type Listing = {
  id:string; owner_id:string; title:string; description:string; category:string; status:string;
  location_name:string|null; latitude:number|null; longitude:number|null; available_until:string|null;
  food_best_before:string|null; food_refrigerated:boolean|null; food_opened:boolean|null; created_at:string;
};
type Image = { id:string; listing_id:string; storage_path:string; sort_order:number };
type Claim = { id:string; listing_id:string; claimant_id:string; status:string; created_at:string; listing?:Listing; claimant?:{display_name:string} };

const categories:Category[]=["Të gjitha","Ushqim","Veshmbathje","Shtëpi","Elektronikë","Fëmijë","Libra","Të tjera"];
const categoryDb:Record<string,string>={Ushqim:"food",Veshmbathje:"clothing",Shtëpi:"home",Elektronikë:"electronics",Fëmijë:"kids",Libra:"books","Të tjera":"other"};
const categoryLabel:Record<string,string>={food:"Ushqim",clothing:"Veshmbathje",home:"Shtëpi",electronics:"Elektronikë",kids:"Fëmijë",books:"Libra",other:"Të tjera"};
const emoji=(c:string)=>({food:"🥖",clothing:"👕",home:"🪑",electronics:"📱",kids:"🧸",books:"📚",other:"🎁"} as Record<string,string>)[c]||"🎁";
const supabase=createClient();

function distanceKm(a:number|null,b:number|null,c:number|null,d:number|null){
  if(a==null||b==null||c==null||d==null)return null;
  const r=Math.PI/180, x=(c-a)*r, y=(d-b)*r;
  const q=Math.sin(x/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));
}

export default function DhurojeHome(){
  const [listings,setListings]=useState<Listing[]>([]),[images,setImages]=useState<Record<string,string[]>>({});
  const [category,setCategory]=useState<Category>("Të gjitha"),[query,setQuery]=useState("");
  const [user,setUser]=useState<any>(null),[profile,setProfile]=useState<any>(null),[favorites,setFavorites]=useState<string[]>([]),[claims,setClaims]=useState<string[]>([]);
  const [showGive,setShowGive]=useState(false),[showAuth,setShowAuth]=useState(false),[showMenu,setShowMenu]=useState(false),[showMessages,setShowMessages]=useState(false);
  const [showDashboard,setShowDashboard]=useState(false),[activeListing,setActiveListing]=useState<Listing|null>(null),[error,setError]=useState("");
  const [authMode,setAuthMode]=useState<"login"|"signup">("login"),[loading,setLoading]=useState(true),[location,setLocation]=useState("Ferizaj");
  const [coords,setCoords]=useState<{lat:number;lon:number}|null>(null),[mapMode,setMapMode]=useState(false),[nearbyOnly,setNearbyOnly]=useState(false);

  async function load(){
    setLoading(true);
    const {data,error:e}=await supabase.from("dhuroje_listings").select("*").eq("status","available").order("created_at",{ascending:false});
    if(e)setError(e.message); else {
      const ls=(data||[]) as Listing[]; setListings(ls);
      if(ls.length){
        const {data:ims}=await supabase.from("dhuroje_listing_images").select("*").in("listing_id",ls.map(x=>x.id)).order("sort_order");
        const grouped:Record<string,string[]>={};
        (ims||[]).forEach((im:any)=>{const u=supabase.storage.from("dhuroje-listings").getPublicUrl(im.storage_path).data.publicUrl;(grouped[im.listing_id]??=[]).push(u);});
        setImages(grouped);
      } else setImages({});
    }
    const {data:{session}}=await supabase.auth.getSession(); const u=session?.user||null; setUser(u);
    if(u){
      const [p,f,c]=await Promise.all([
        supabase.from("dhuroje_profiles").select("*").eq("id",u.id).maybeSingle(),
        supabase.from("dhuroje_favorites").select("listing_id").eq("user_id",u.id),
        supabase.from("dhuroje_claims").select("listing_id").eq("claimant_id",u.id)
      ]);
      setProfile(p.data);setFavorites((f.data||[]).map(x=>x.listing_id));setClaims((c.data||[]).map(x=>x.listing_id));
    } else {setProfile(null);setFavorites([]);setClaims([]);}
    setLoading(false);
  }

  useEffect(()=>{load(); const {data}=supabase.auth.onAuthStateChange((_event,session)=>{setUser(session?.user||null); window.setTimeout(load,350);}); return()=>data.subscription.unsubscribe();},[]);
  useEffect(()=>{
    const channel=supabase.channel("dhuroje-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"dhuroje_listings"},()=>load())
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"dhuroje_messages"},()=>user&&setShowMessages(true))
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[user]);

  const filtered=useMemo(()=>{
    let a=listings.filter(x=>(category==="Të gjitha"||x.category===categoryDb[category])&&(x.title+" "+(x.description||"")).toLowerCase().includes(query.toLowerCase()));
    if(nearbyOnly&&coords)a=a.filter(x=>{const d=distanceKm(coords.lat,coords.lon,x.latitude,x.longitude);return d!=null&&d<=25;});
    if(coords)a=[...a].sort((x,y)=>(distanceKm(coords.lat,coords.lon,x.latitude,x.longitude)??9999)-(distanceKm(coords.lat,coords.lon,y.latitude,y.longitude)??9999));
    return a;
  },[listings,category,query,coords,nearbyOnly]);

  async function ensureGuest(){ if(user)return user; setError(""); const {data,error:e}=await supabase.auth.signInAnonymously(); if(e){setError("Postimi si mysafir nuk është aktivizuar ende në Supabase."); return null;} setUser(data.user); return data.user; }
  async function requireAuth(){if(!user){setShowAuth(true);return false;}return true;}
  async function auth(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError("");const f=new FormData(e.currentTarget),email=String(f.get("email")),password=String(f.get("password"));
    const result=authMode==="signup"?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});
    if(result.error){setError(result.error.message);return;}
    if(authMode==="signup"&&result.data.user){
      await supabase.from("dhuroje_profiles").upsert({id:result.data.user.id,display_name:String(f.get("name")||email.split("@")[0])});
      if(!result.data.session){setError("Kontrollo email-in për konfirmim.");return;}
    }
    setShowAuth(false);await load();
  }
  async function signOut(){await supabase.auth.signOut();setShowMenu(false);await load();}
  async function toggleFavorite(id:string){
    if(!requireAuth())return;
    if(favorites.includes(id)){await supabase.from("dhuroje_favorites").delete().eq("user_id",user.id).eq("listing_id",id);setFavorites(x=>x.filter(v=>v!==id));}
    else{await supabase.from("dhuroje_favorites").insert({user_id:user.id,listing_id:id});setFavorites(x=>[...x,id]);}
  }
  async function claim(id:string){
    if(!requireAuth())return;if(claims.includes(id))return;
    const {error:e}=await supabase.from("dhuroje_claims").insert({listing_id:id,claimant_id:user.id,status:"pending"});
    if(e){setError(e.message);return;}setClaims(x=>[...x,id]);
  }
  async function createListing(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); const postingUser=await ensureGuest(); if(!postingUser)return; setError("");
    const f=new FormData(e.currentTarget), files=Array.from(f.getAll("photos")).filter((x):x is File=>x instanceof File&&x.size>0);
    const {data:item,error:e1}=await supabase.from("dhuroje_listings").insert({
      owner_id:postingUser.id,title:String(f.get("title")),description:String(f.get("description")||""),
      category:categoryDb[String(f.get("category"))]||"other",status:"available",location_name:location,
      latitude:coords?.lat??null,longitude:coords?.lon??null,
      available_until:f.get("available_until")?new Date(String(f.get("available_until"))).toISOString():null,
      food_best_before:f.get("food_best_before")?new Date(String(f.get("food_best_before"))).toISOString():null,
      food_refrigerated:f.get("food_refrigerated")==="on",food_opened:f.get("food_opened")==="on"
    }).select("*").single();
    if(e1||!item){setError(e1?.message||"Nuk u krijua shpallja.");return;}
    for(let i=0;i<Math.min(files.length,6);i++){
      const file=files[i], ext=file.name.split(".").pop()?.toLowerCase()||"jpg", path=user.id+"/"+item.id+"/"+i+"-"+crypto.randomUUID()+"."+ext;
      const up=await supabase.storage.from("dhuroje-listings").upload(path,file,{contentType:file.type||"image/jpeg",upsert:false});
      if(!up.error)await supabase.from("dhuroje_listing_images").insert({listing_id:item.id,storage_path:path,sort_order:i});
    }
    setShowGive(false);await load();
  }
  async function startChat(listing:Listing){
    if(!requireAuth())return;
    const existing=await supabase.from("dhuroje_conversations").select("id").eq("listing_id",listing.id).limit(1).maybeSingle();
    let cid=existing.data?.id;
    if(!cid){const {data:c,error:e}=await supabase.from("dhuroje_conversations").insert({listing_id:listing.id}).select("id").single();if(e){setError(e.message);return;}cid=c.id;await supabase.from("dhuroje_conversation_members").insert([{conversation_id:cid,user_id:user.id},{conversation_id:cid,user_id:listing.owner_id}]);}
    setShowMessages(true);
  }
  function locate(){
    if(!navigator.geolocation)return setError("Ky shfletues nuk mbështet lokacionin.");
    navigator.geolocation.getCurrentPosition(p=>{setCoords({lat:p.coords.latitude,lon:p.coords.longitude});setLocation("Lokacioni im");},()=>setError("Lokacioni nuk u lejua."));
  }

  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">D</span><span>Dhuroje</span></div><div className="top-actions">
      <button className="header-link" onClick={()=>requireAuth()&&setShowGive(true)}>Dhuro</button><button className="profile-button" onClick={()=>setShowMenu(!showMenu)}>●</button>
      {showMenu&&<div className="profile-menu">{user?<><strong>{profile?.display_name||user.email}</strong><button onClick={()=>setShowMessages(true)}>💬 Mesazhet</button><button onClick={()=>requireAuth()&&setShowDashboard(true)}>📦 Paneli im</button><button onClick={signOut}>Dil</button></>:<button onClick={()=>setShowAuth(true)}>Hyr / Regjistrohu</button>}</div>}
    </div></header>

    <section className="hero"><div><p className="eyebrow">DHURATA PRANË TEJE</p><h1>Gjej.<br/><span>Merr. Dhuro.</span></h1><p className="hero-copy">Gjëra falas nga njerëzit e komunitetit tënd. Jepu një jetë të dytë.</p></div><div className="hero-actions"><button className="primary" onClick={()=>requireAuth()&&setShowGive(true)}>＋ Dhuro një gjë</button>{user&&<button className="secondary" onClick={()=>setShowDashboard(true)}>Paneli im</button>}</div></section>
    <section className="search-wrap"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Kërko ushqim, rroba, mobilie..."/></section>
    <section className="categories">{categories.map(x=><button key={x} className={category===x?"chip active":"chip"} onClick={()=>setCategory(x)}>{x}</button>)}</section>
    <section className="location-row"><div><span className="pin">⌖</span><div><strong>{location}</strong><small>{nearbyOnly?"Brenda 25 km":"Shpallje falas në zonën tënde"}</small></div></div><div className="location-actions"><button className="filter-button" onClick={locate}>📍 Përdor lokacionin</button><button className="map-toggle" onClick={()=>setMapMode(x=>!x)}>🗺️ {mapMode?"Lista":"Harta"}</button></div></section>
    {coords&&<div className="filter-panel"><button onClick={()=>setNearbyOnly(x=>!x)}>{nearbyOnly?"✓ Brenda 25 km":"Pranë meje · 25 km"}</button><span className="nearby-hint">Renditur sipas distancës</span></div>}
    {mapMode&&coords&&<section className="map-panel"><iframe title="Harta e Dhuroje" src={"https://www.openstreetmap.org/export/embed.html?bbox="+(coords.lon-.12)+"%2C"+(coords.lat-.08)+"%2C"+(coords.lon+.12)+"%2C"+(coords.lat+.08)+"&layer=mapnik&marker="+coords.lat+"%2C"+coords.lon}/><div className="map-list">{filtered.slice(0,8).map(x=><button key={x.id} onClick={()=>setActiveListing(x)}>{emoji(x.category)} <span><b>{x.title}</b><small>{x.location_name||"Pranë teje"}{distanceKm(coords.lat,coords.lon,x.latitude,x.longitude)!=null?" · "+distanceKm(coords.lat,coords.lon,x.latitude,x.longitude)!.toFixed(1)+" km":""}</small></span></button>)}</div></section>}

    <section className="section-head"><div><p className="eyebrow">FALAS PRANË TEJE</p><h2>{filtered.length} dhurata</h2></div><span className="sort">Më të rejat</span></section>
    {error&&<div className="error">{error}<button onClick={()=>setError("")}>×</button></div>}
    {!mapMode&&<section className="listing-grid">{filtered.map(item=><article className="card" key={item.id} onClick={()=>setActiveListing(item)}>
      <div className="card-image">{images[item.id]?.[0]?<img src={images[item.id][0]} alt="" />:<span>{emoji(item.category)}</span>}<b>FALAS</b><button className="heart" onClick={e=>{e.stopPropagation();toggleFavorite(item.id)}}>{favorites.includes(item.id)?"♥":"♡"}</button></div>
      <div className="card-body"><div className="meta"><span>{categoryLabel[item.category]||item.category}</span><span>📍 {item.location_name||"Pranë teje"}</span></div><h3>{item.title}</h3><p>{item.description||"Pa përshkrim."}</p>
      <div className="card-footer"><small>{coords&&distanceKm(coords.lat,coords.lon,item.latitude,item.longitude)!=null?distanceKm(coords.lat,coords.lon,item.latitude,item.longitude)!.toFixed(1)+" km · ":""}{item.available_until?"Deri "+new Date(item.available_until).toLocaleDateString("sq-AL"):"Sapo u postua"}</small><button className={claims.includes(item.id)?"claimed":"claim"} onClick={e=>{e.stopPropagation();claim(item.id)}}>{claims.includes(item.id)?"Kërkuar ✓":"Kërko"}</button></div></div>
    </article>)}</section>}
    {!loading&&filtered.length===0&&<div className="empty">Nuk ka ende dhurata që përputhen me kërkimin.</div>}

    {showGive&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setShowGive(false)}><form className="modal" onSubmit={createListing}><div className="modal-head"><div><p className="eyebrow">DHUROJE</p><h2>Posto diçka falas</h2></div><button type="button" className="close" onClick={()=>setShowGive(false)}>×</button></div>
      <label>Çfarë po dhuron?<input name="title" required placeholder="p.sh. 5 pako bukë"/></label><label>Kategoria<select name="category" defaultValue="Ushqim">{categories.slice(1).map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Fotot <input name="photos" type="file" accept="image/*" multiple /></label><small className="form-help">Deri në 6 foto. Fotot ruhen në Dhuroje.</small>
      <label>Përshkrimi<textarea name="description" placeholder="Gjendja, sasia, kushtet e marrjes..."/></label><label>Disponueshme deri<input name="available_until" type="datetime-local"/></label>
      <label>Afati i ushqimit<input name="food_best_before" type="datetime-local"/></label><div className="check-row"><label><input name="food_refrigerated" type="checkbox"/> Kërkon frigorifer</label><label><input name="food_opened" type="checkbox"/> E hapur</label></div>
      <div className="food-note">📍 {location}. Lejo lokacionin para publikimit nëse dëshiron që shpallja të renditet pranë teje.</div><button className="primary full" type="submit">Publiko falas</button>
    </form></div>}

    {activeListing&&<ListingDetail listing={activeListing} image={images[activeListing.id]?.[0]} saved={favorites.includes(activeListing.id)} claimed={claims.includes(activeListing.id)} onClose={()=>setActiveListing(null)} onClaim={()=>claim(activeListing.id)} onSave={()=>toggleFavorite(activeListing.id)} onChat={()=>startChat(activeListing)}/>}
    {showAuth&&<div className="modal-backdrop"><form className="modal" onSubmit={auth}><div className="modal-head"><div><p className="eyebrow">DHUROJE</p><h2>{authMode==="login"?"Hyr në llogari":"Krijo llogari"}</h2></div><button type="button" className="close" onClick={()=>setShowAuth(false)}>×</button></div>{authMode==="signup"&&<label>Emri<input name="name" required placeholder="Emri yt"/></label>}<label>Email<input name="email" type="email" required/></label><label>Fjalëkalimi<input name="password" type="password" minLength={6} required/></label><button className="primary full">{authMode==="login"?"Hyr":"Regjistrohu"}</button><button type="button" className="secondary full" onClick={()=>setAuthMode(authMode==="login"?"signup":"login")}>{authMode==="login"?"Krijo llogari":"Kam llogari"}</button></form></div>}
    {showMessages&&<Messages user={user} onClose={()=>setShowMessages(false)}/>}
    {showDashboard&&<Dashboard user={user} onClose={()=>setShowDashboard(false)} onChanged={load}/>}
    <nav className="bottom-nav"><button className="nav-active" onClick={()=>{setMapMode(false);setShowDashboard(false)}}>⌂<span>Eksploro</span></button><button onClick={()=>requireAuth()&&setCategory("Të gjitha")}>♡<span>Ruajturat</span></button><button onClick={()=>requireAuth()&&setShowGive(true)} className="nav-add">＋</button><button onClick={()=>requireAuth()&&setShowMessages(true)}>▱<span>Mesazhet</span></button><button onClick={()=>setShowMenu(!showMenu)}>●<span>Profili</span></button></nav>
  </main>;
}

function ListingDetail({listing,image,saved,claimed,onClose,onClaim,onSave,onChat}:{listing:Listing;image?:string;saved:boolean;claimed:boolean;onClose:()=>void;onClaim:()=>void;onSave:()=>void;onChat:()=>void}){
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal"><div className="modal-head"><div><p className="eyebrow">{categoryLabel[listing.category]||listing.category}</p><h2>{listing.title}</h2></div><button className="close" onClick={onClose}>×</button></div>{image?<img className="detail-image" src={image} alt=""/>:<div className="detail-emoji">{emoji(listing.category)}</div>}<p>{listing.description||"Pa përshkrim."}</p><p>📍 {listing.location_name||"Pranë teje"}</p>{listing.food_best_before&&<p>🍎 Afati: {new Date(listing.food_best_before).toLocaleDateString("sq-AL")}</p>}<div className="detail-actions"><button className="primary" onClick={onClaim}>{claimed?"Kërkesa u dërgua ✓":"Kërko këtë dhuratë"}</button><button className="secondary" onClick={onChat}>💬 Mesazho dhuruesin</button><button className="secondary" onClick={onSave}>{saved?"♥ Ruajtur":"♡ Ruaje"}</button></div></div></div>;
}

function Messages({user,onClose}:{user:any;onClose:()=>void}){
  const [convos,setConvos]=useState<any[]>([]),[selected,setSelected]=useState<any>(null),[body,setBody]=useState(""),[messages,setMessages]=useState<any[]>([]);
  async function load(){if(!user)return;const {data}=await supabase.from("dhuroje_conversation_members").select("conversation_id").eq("user_id",user.id);const ids=(data||[]).map(x=>x.conversation_id);if(!ids.length){setConvos([]);return;}const {data:cs}=await supabase.from("dhuroje_conversations").select("id,listing_id,created_at").in("id",ids).order("created_at",{ascending:false});setConvos(cs||[]);}
  useEffect(()=>{load();},[]);
  useEffect(()=>{if(!selected)return;supabase.from("dhuroje_messages").select("*").eq("conversation_id",selected.id).order("created_at").then(({data})=>setMessages(data||[]));const ch=supabase.channel("msg-"+selected.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"dhuroje_messages",filter:"conversation_id=eq."+selected.id},(p:any)=>setMessages(x=>[...x,p.new])).subscribe();return()=>{supabase.removeChannel(ch);};},[selected]);
  async function send(){if(!selected||!body.trim())return;const {error}=await supabase.from("dhuroje_messages").insert({conversation_id:selected.id,sender_id:user.id,body:body.trim()});if(error)alert(error.message);setBody("");}
  return <div className="modal-backdrop"><div className="modal messages-modal"><div className="modal-head"><h2>Mesazhet</h2><button className="close" onClick={onClose}>×</button></div>{!convos.length?<div className="empty">Nuk ke ende biseda.</div>:<div className="message-list">{convos.map(c=><button key={c.id} onClick={()=>setSelected(c)}>💬 Bisedë · {new Date(c.created_at).toLocaleDateString("sq-AL")}</button>)}</div>}{selected&&<><div className="chat-messages">{messages.map(m=><div className={m.sender_id===user.id?"bubble mine":"bubble"} key={m.id}>{m.body}<small>{new Date(m.created_at).toLocaleTimeString("sq-AL",{hour:"2-digit",minute:"2-digit"})}</small></div>)}</div><div className="composer"><input value={body} onChange={e=>setBody(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Shkruaj mesazh..."/><button className="primary" onClick={send}>Dërgo</button></div></>}</div></div>;
}

function Dashboard({user,onClose,onChanged}:{user:any;onClose:()=>void;onChanged:()=>void}){
  const [tab,setTab]=useState<"my"|"requests">("my"),[mine,setMine]=useState<Listing[]>([]),[incoming,setIncoming]=useState<Claim[]>([]),[busy,setBusy]=useState(false);
  async function load(){
    if(!user)return;
    const {data:ls}=await supabase.from("dhuroje_listings").select("*").eq("owner_id",user.id).order("created_at",{ascending:false});setMine(ls||[]);
    const {data:cs}=await supabase.from("dhuroje_claims").select("*, listing:dhuroje_listings(*)").order("created_at",{ascending:false});setIncoming((cs||[]).filter((x:any)=>x.listing?.owner_id===user.id));
  }
  useEffect(()=>{load();},[]);
  async function action(c:Claim,status:string){
    setBusy(true);
    const {error}=await supabase.from("dhuroje_claims").update({status}).eq("id",c.id);
    if(!error&&status==="accepted")await supabase.from("dhuroje_listings").update({status:"reserved"}).eq("id",c.listing_id).eq("owner_id",user.id);
    if(!error&&status==="collected")await supabase.from("dhuroje_listings").update({status:"collected"}).eq("id",c.listing_id).eq("owner_id",user.id);
    if(!error){await load();onChanged();}else alert(error.message);setBusy(false);
  }
  async function setListing(id:string,status:string){setBusy(true);await supabase.from("dhuroje_listings").update({status}).eq("id",id).eq("owner_id",user.id);await load();onChanged();setBusy(false);}
  return <div className="modal-backdrop"><div className="modal dashboard"><div className="modal-head"><div><p className="eyebrow">LLOGARIA IME</p><h2>Paneli im</h2></div><button className="close" onClick={onClose}>×</button></div><div className="dash-tabs"><button className={tab==="my"?"active":""} onClick={()=>setTab("my")}>Shpalljet e mia ({mine.length})</button><button className={tab==="requests"?"active":""} onClick={()=>setTab("requests")}>Kërkesat ({incoming.filter(x=>x.status==="pending").length})</button></div>
  {tab==="my"?<div className="dash-list">{mine.length?mine.map(x=><div className="dash-row" key={x.id}><span className="dash-icon">{emoji(x.category)}</span><div><b>{x.title}</b><small>{x.status==="available"?"E disponueshme":x.status==="reserved"?"E rezervuar":x.status==="collected"?"E dhuruar":"Jo aktive"}</small></div>{x.status==="available"&&<button disabled={busy} onClick={()=>setListing(x.id,"removed")}>Hiqe</button>}{x.status==="reserved"&&<button disabled={busy} onClick={()=>setListing(x.id,"collected")}>U mor</button>}</div>):<div className="empty">Nuk ke publikuar ende asgjë.</div>}</div>
  :<div className="dash-list">{incoming.length?incoming.map(c=><div className="dash-row" key={c.id}><span className="dash-icon">{emoji(c.listing?.category||"other")}</span><div><b>{c.listing?.title||"Dhuratë"}</b><small>{c.status==="pending"?"Kërkesë e re":c.status}</small></div>{c.status==="pending"&&<><button disabled={busy} className="accept" onClick={()=>action(c,"accepted")}>Prano</button><button disabled={busy} onClick={()=>action(c,"declined")}>Refuzo</button></>}</div>):<div className="empty">Nuk ke kërkesa ende.</div>}</div>}</div></div>;
}