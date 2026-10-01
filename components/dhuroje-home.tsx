'use client';

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Category = "Të gjitha" | "Ushqim" | "Veshmbathje" | "Shtëpi" | "Elektronikë" | "Fëmijë" | "Libra" | "Të tjera";
type Listing = {
  id:string; owner_id:string; title:string; description:string; category:string; status:string;
  location_name:string|null; latitude:number|null; longitude:number|null; available_until:string|null;
  food_best_before:string|null; food_refrigerated:boolean|null; food_opened:boolean|null; created_at:string;
  owner?:{display_name:string|null; avatar_url?:string|null}|null;
};
type Image = { id:string; listing_id:string; storage_path:string; sort_order:number };
type Claim = { id:string; listing_id:string; claimant_id:string; status:string; created_at:string; listing?:Listing; claimant?:{display_name:string} };

const categories:Category[]=["Të gjitha","Ushqim","Veshmbathje","Shtëpi","Elektronikë","Fëmijë","Libra","Të tjera"];
const categoryDb:Record<string,string>={Ushqim:"food",Veshmbathje:"clothing",Shtëpi:"home",Elektronikë:"electronics",Fëmijë:"kids",Libra:"books","Të tjera":"other"};
const categoryLabel:Record<string,string>={food:"Ushqim",clothing:"Veshmbathje",home:"Shtëpi",electronics:"Elektronikë",kids:"Fëmijë",books:"Libra",other:"Të tjera"};
const emoji=(c:string)=>({food:"🥖",clothing:"👕",home:"🪑",electronics:"📱",kids:"🧸",books:"📚",other:"🎁"} as Record<string,string>)[c]||"🎁";
const supabase=createClient();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

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
  const [showGive,setShowGive]=useState(false),[showAuth,setShowAuth]=useState(false),[postAuth,setPostAuth]=useState(false),[postChoice,setPostChoice]=useState(false),[showMenu,setShowMenu]=useState(false),[showMessages,setShowMessages]=useState(false),[postingCategory,setPostingCategory]=useState("Ushqim");
  const [pendingPost,setPendingPost]=useState<FormData|null>(null),[posting,setPosting]=useState(false);
  const [showDashboard,setShowDashboard]=useState(false),[activeListing,setActiveListing]=useState<Listing|null>(null),[editingListing,setEditingListing]=useState<Listing|null>(null),[error,setError]=useState("");
  const [authMode,setAuthMode]=useState<"login"|"signup">("login"),[loading,setLoading]=useState(true),[location,setLocation]=useState("Ferizaj");
  const [coords,setCoords]=useState<{lat:number;lon:number}|null>(null),[mapMode,setMapMode]=useState(false),[nearbyOnly,setNearbyOnly]=useState(false),[favoritesOnly,setFavoritesOnly]=useState(false);

  async function load(){
    setLoading(true);
    const {data,error:e}=await supabase.from("dhuroje_listings").select("*, owner:dhuroje_profiles!dhuroje_listings_owner_id_fkey(id,display_name,avatar_url)").eq("status","available").order("created_at",{ascending:false});
    if(e)setError(e.message); else {
      const ls=(data||[]) as Listing[];
      setListings(ls);
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

  useEffect(()=>{load(); const {data}=supabase.auth.onAuthStateChange((_event,session)=>{setUser(session?.user||null);}); return()=>data.subscription.unsubscribe();},[]);
  useEffect(()=>{
    const channel=supabase.channel("dhuroje-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"dhuroje_listings"},()=>{if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=setTimeout(load,900);})
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"dhuroje_messages"},()=>user&&setShowMessages(true))
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[user]);

  const filtered=useMemo(()=>{
    let a=listings.filter(x=>(category==="Të gjitha"||x.category===categoryDb[category])&&(x.title+" "+(x.description||"")).toLowerCase().includes(query.toLowerCase())&&(!favoritesOnly||favorites.includes(x.id)));
    if(nearbyOnly&&coords)a=a.filter(x=>{const d=distanceKm(coords.lat,coords.lon,x.latitude,x.longitude);return d!=null&&d<=25;});
    if(coords)a=[...a].sort((x,y)=>(distanceKm(coords.lat,coords.lon,x.latitude,x.longitude)??9999)-(distanceKm(coords.lat,coords.lon,y.latitude,y.longitude)??9999));
    return a;
  },[listings,category,query,coords,nearbyOnly,favoritesOnly,favorites]);

  async function requireAuthenticatedUser(){
    const {data,error:e}=await supabase.auth.getUser();
    if(e||!data.user){setShowAuth(true);setAuthMode("login");return null;}
    if(!user||user.id!==data.user.id)setUser(data.user);
    return data.user;
  }
  function requireAuth(){if(!user){setShowAuth(true);setAuthMode("login");return false;}return true;}
  async function auth(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError("");
    const f=new FormData(e.currentTarget),email=String(f.get("email")),password=String(f.get("password"));
    const result=authMode==="signup"
      ?await supabase.auth.signUp({email,password})
      :await supabase.auth.signInWithPassword({email,password});
    if(result.error){setError(result.error.message);return;}
    if(authMode==="signup"&&result.data.user){
      await supabase.from("dhuroje_profiles").upsert({id:result.data.user.id,display_name:String(f.get("name")||email.split("@")[0])});
      if(pendingPost){
        if(!result.data.session){setError("Llogaria u krijua. Nëse kërkohet konfirmim email-i, konfirmoje dhe pastaj publikoje përsëri.");return;}
        setPosting(true);
        const ok=await finishListing(result.data.user,pendingPost);
        setPosting(false);
        setPendingPost(null);
        if(ok){setShowAuth(false);setShowGive(false);await load();return;}
      }
    }
    setShowAuth(false);
    if(postAuth){setPostAuth(false);setPostChoice(false);setShowGive(true);}
    await load();
  }
  async function signOut(){await supabase.auth.signOut();setShowMenu(false);await load();}
  async function toggleFavorite(id:string){
    if(!requireAuth())return;
    if(favorites.includes(id)){await supabase.from("dhuroje_favorites").delete().eq("user_id",user.id).eq("listing_id",id);setFavorites(x=>x.filter(v=>v!==id));}
    else{await supabase.from("dhuroje_favorites").insert({user_id:user.id,listing_id:id});setFavorites(x=>[...x,id]);}
  }
  async function claim(id:string){
    const currentUser=await requireAuthenticatedUser();
    if(!currentUser)return;
    if(claims.includes(id)){
      const {error:e}=await supabase.from("dhuroje_claims").delete().eq("listing_id",id).eq("claimant_id",currentUser.id);
      if(e){setError(e.message);return;}
      setClaims(x=>x.filter(v=>v!==id));
      return;
    }
    const listing=listings.find(x=>x.id===id)||activeListing;
    if(!listing)return;
    if(listing.owner_id===currentUser.id){setError("Nuk mund të kërkosh dhuratën tënde.");return;}
    if(listing.status!=="available"){setError("Kjo dhuratë nuk është më e disponueshme.");return;}
    const {error:e}=await supabase.from("dhuroje_claims").insert({listing_id:id,claimant_id:currentUser.id,status:"pending"});
    if(e){setError(e.message);return;}
    setClaims(x=>[...x,id]);
  }
  async function finishListing(postingUser:any,f:FormData){
    const files=Array.from(f.getAll("photos")).filter((x):x is File=>x instanceof File&&x.size>0);
    const {data:item,error:e1}=await supabase.from("dhuroje_listings").insert({
      owner_id:postingUser.id,title:String(f.get("title")),description:String(f.get("description")||""),
      category:categoryDb[String(f.get("category"))]||"other",status:"available",location_name:location,
      latitude:coords?.lat??null,longitude:coords?.lon??null,
      available_until:f.get("available_until")?new Date(String(f.get("available_until"))).toISOString():null,
      food_best_before:f.get("food_best_before")?new Date(String(f.get("food_best_before"))).toISOString():null,
      food_refrigerated:categoryDb[String(f.get("category"))]==="food"&&f.get("food_refrigerated")==="on",food_opened:categoryDb[String(f.get("category"))]==="food"&&f.get("food_opened")==="on"
    }).select("*").single();
    if(e1||!item){setError(e1?.message||"Nuk u krijua shpallja.");return false;}
    for(let i=0;i<Math.min(files.length,6);i++){
      const file=files[i],ext=file.name.split(".").pop()?.toLowerCase()||"jpg",path=postingUser.id+"/"+item.id+"/"+i+"-"+crypto.randomUUID()+"."+ext;
      const up=await supabase.storage.from("dhuroje-listings").upload(path,file,{contentType:file.type||"image/jpeg",upsert:false});
      if(!up.error)await supabase.from("dhuroje_listing_images").insert({listing_id:item.id,storage_path:path,sort_order:i});
    }
    return true;
  }
  async function createListing(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError("");
    const f=new FormData(e.currentTarget);
    setPosting(true);
    if(!user){setError("Hyr ose krijo një llogari para se të publikosh.");setPosting(false);return;}
    const ok=await finishListing(user,f);
    setPosting(false);
    if(ok){setShowGive(false);await load();}
  }
  async function deleteListing(listing:Listing){
    const currentUser=await requireAuthenticatedUser(); if(!currentUser)return;
    if(currentUser.id!==listing.owner_id){setError("Nuk mund ta fshish këtë shpallje.");return;}
    if(!window.confirm("Ta fshijmë përgjithmonë këtë shpallje?"))return;
    setError("");
    const {data:ims}=await supabase.from("dhuroje_listing_images").select("storage_path").eq("listing_id",listing.id);
    const {data:deleted,error:e}=await supabase.rpc("dhuroje_delete_listing",{p_listing_id:listing.id});
    if(e||!deleted){setError(e?.message||"Shpallja nuk u fshi.");return;}
    if(ims?.length)await supabase.storage.from("dhuroje-listings").remove(ims.map((x:any)=>x.storage_path));
    if(activeListing?.id===listing.id)setActiveListing(null);
    await load();
  }
  async function quickEditListing(listing:Listing){
    const currentUser=await requireAuthenticatedUser(); if(!currentUser)return;
    if(currentUser.id!==listing.owner_id){setError("Nuk mund ta ndryshosh këtë shpallje.");return;}
    setEditingListing(listing);
  }
  async function markAsGiven(listing:Listing){
    const currentUser=await requireAuthenticatedUser(); if(!currentUser)return;
    if(currentUser.id!==listing.owner_id){setError("Nuk mund ta shënosh këtë shpallje si të dhuruar.");return;}
    if(!window.confirm("Ta shënojmë këtë shpallje si të dhuruar? Ajo do të hiqet nga lista e dhuratave aktive."))return;
    const {error:e}=await supabase.from("dhuroje_listings").update({status:"collected"}).eq("id",listing.id).eq("owner_id",currentUser.id);
    if(e){setError(e.message);return;}
    setActiveListing(null);setEditingListing(null);await load();
  }
  async function startChat(listing:Listing,targetUserId?:string){
    const currentUser=await requireAuthenticatedUser();
    if(!currentUser)return;
    let otherUserId=targetUserId;
    if(listing.owner_id!==currentUser.id){
      const {data:claimRow,error:claimError}=await supabase.from("dhuroje_claims").select("id,status").eq("listing_id",listing.id).eq("claimant_id",currentUser.id).maybeSingle();
      if(claimError){setError(claimError.message);return;}
      if(!claimRow){setError("Së pari dërgo një kërkesë për këtë dhuratë. Kështu dhuruesi e di kush po e kërkon.");return;}
      if(["declined","cancelled","no_show"].includes(claimRow.status)){setError("Kjo kërkesë nuk është më aktive.");return;}
      otherUserId=listing.owner_id;
    } else if(!otherUserId){
      setError("Për të kontaktuar një kërkues, hape kërkesën te Paneli im dhe zgjidh Mesazho.");
      return;
    }
    if(otherUserId===currentUser.id){setError("Nuk mund të hapësh bisedë me veten.");return;}
    const existingMember=await supabase.from("dhuroje_conversation_members").select("conversation_id").eq("user_id",currentUser.id);
    if(existingMember.error){setError(existingMember.error.message);return;}
    let cid:string|undefined;
    const memberIds=(existingMember.data||[]).map((x:any)=>x.conversation_id);
    if(memberIds.length){
      const targetMember=await supabase.from("dhuroje_conversation_members").select("conversation_id").in("conversation_id",memberIds).eq("user_id",otherUserId);
      if(targetMember.error){setError(targetMember.error.message);return;}
      const pairIds=(targetMember.data||[]).map((x:any)=>x.conversation_id);
      if(pairIds.length){
        const existingConversation=await supabase.from("dhuroje_conversations").select("id").in("id",pairIds).eq("listing_id",listing.id).limit(1).maybeSingle();
        if(existingConversation.error){setError(existingConversation.error.message);return;}
        cid=existingConversation.data?.id;
      }
    }
    if(!cid){
      cid=crypto.randomUUID();
      const {error:e}=await supabase.from("dhuroje_conversations").insert({id:cid,listing_id:listing.id});
      if(e){setError(e.message||"Nuk u krijua biseda.");return;}
      const members=[{conversation_id:cid,user_id:currentUser.id},{conversation_id:cid,user_id:otherUserId}];
      const {error:me}=await supabase.from("dhuroje_conversation_members").insert(members);
      if(me){setError(me.message);return;}
    }
    setShowMessages(true);
  }
  function openPosting(){
    setError("");
    setPostingCategory("Ushqim");
    if(user){setPostChoice(false);setShowGive(true);return;}
    setPostChoice(true);setShowGive(false);
  }
  function choosePostAuth(mode:"login"|"signup"){
    setAuthMode(mode);setPostAuth(true);setPostChoice(false);setShowAuth(true);
  }
  function locate(){
    if(!navigator.geolocation)return setError("Ky shfletues nuk mbështet lokacionin.");
    navigator.geolocation.getCurrentPosition(p=>{setCoords({lat:p.coords.latitude,lon:p.coords.longitude});setLocation("Lokacioni im");},()=>setError("Lokacioni nuk u lejua."));
  }

  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">D</span><span>Dhuroje</span></div><div className="top-actions">
      <button className="header-link" onClick={()=>openPosting()}>Dhuro</button><button className="profile-button" onClick={()=>setShowMenu(!showMenu)}>●</button>
      {showMenu&&<div className="profile-menu">{user?<><strong>{profile?.display_name||user.email}</strong><button onClick={()=>setShowMessages(true)}>💬 Mesazhet</button><button onClick={()=>requireAuth()&&setShowDashboard(true)}>📦 Paneli im</button><button onClick={signOut}>Dil</button></>:<button onClick={()=>setShowAuth(true)}>Hyr / Regjistrohu</button>}</div>}
    </div></header>

    <section className="hero"><div><p className="eyebrow">♻️ DHURATA PRANË TEJE</p><h1>Gjej diçka.<br/><span>Dhuro diçka.</span></h1><p className="hero-copy">Gjërat që nuk të duhen më mund t'i bëjnë dikujt tjetër shumë punë.</p></div><div className="hero-actions"><button className="primary" onClick={()=>openPosting()}>＋ Dhuro</button>{user&&<button className="secondary" onClick={()=>setShowDashboard(true)}>Profili im</button>}</div></section>
    <section className="search-wrap"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Çfarë po kërkon? p.sh. karrige, rroba..."/></section>
    <section className="categories">{categories.map(x=><button key={x} className={category===x?"chip active":"chip"} onClick={()=>setCategory(x)}>{x}</button>)}</section>
    <section className="location-row"><div><span className="pin">⌖</span><div><strong>{location}</strong><small>{nearbyOnly?"Brenda 25 km":"Shih çfarë po dhurohet pranë teje"}</small></div></div><div className="location-actions"><button className="filter-button" onClick={locate}>📍 Përdor lokacionin</button><button className="map-toggle" onClick={()=>setMapMode(x=>!x)}>🗺️ {mapMode?"Lista":"Harta"}</button></div></section>
    {coords&&<div className="filter-panel"><button onClick={()=>setNearbyOnly(x=>!x)}>{nearbyOnly?"✓ Brenda 25 km":"Pranë meje · 25 km"}</button><span className="nearby-hint">Renditur sipas distancës</span></div>}
    {mapMode&&coords&&<section className="map-panel"><iframe title="Harta e Dhuroje" src={"https://www.openstreetmap.org/export/embed.html?bbox="+(coords.lon-.12)+"%2C"+(coords.lat-.08)+"%2C"+(coords.lon+.12)+"%2C"+(coords.lat+.08)+"&layer=mapnik&marker="+coords.lat+"%2C"+coords.lon}/><div className="map-list">{filtered.slice(0,8).map(x=><button key={x.id} onClick={()=>setActiveListing(x)}>{emoji(x.category)} <span><b>{x.title}</b><small>{x.location_name||"Pranë teje"}{distanceKm(coords.lat,coords.lon,x.latitude,x.longitude)!=null?" · "+distanceKm(coords.lat,coords.lon,x.latitude,x.longitude)!.toFixed(1)+" km":""}</small></span></button>)}</div></section>}

    <section className="section-head"><div><p className="eyebrow">PRANË TEJE</p><h2>{filtered.length} dhurata falas</h2></div><span className="sort">Më të rejat ↓</span></section>
    {error&&<div className="error">{error}<button onClick={()=>setError("")}>×</button></div>}
    {!mapMode&&<section className="listing-grid">{filtered.map(item=><article className="card" key={item.id} onClick={()=>setActiveListing(item)}>
      <div className="card-image">{images[item.id]?.[0]?<img src={images[item.id][0]} alt="" />:<span>{emoji(item.category)}</span>}<b>FALAS</b><button className="heart" onClick={e=>{e.stopPropagation();toggleFavorite(item.id)}}>{favorites.includes(item.id)?"♥":"♡"}</button></div>
      <div className="card-body"><div className="meta"><span>{categoryLabel[item.category]||item.category}</span><span>📍 {item.location_name||"Pranë teje"}</span></div><div className="poster-line">👤 <strong>{item.owner?.display_name||"Përdorues i regjistruar"}</strong></div><h3>{item.title}</h3><p>{item.description||"Pa përshkrim."}</p>
      <div className="card-footer"><small>{item.owner?.display_name||"Përdorues i regjistruar"} · {coords&&distanceKm(coords.lat,coords.lon,item.latitude,item.longitude)!=null?distanceKm(coords.lat,coords.lon,item.latitude,item.longitude)!.toFixed(1)+" km · ":""}{item.available_until?"Deri "+new Date(item.available_until).toLocaleDateString("sq-AL"):"Sapo u postua"}</small>{user?.id!==item.owner_id&&<button className={claims.includes(item.id)?"claimed":"claim"} onClick={e=>{e.stopPropagation();claim(item.id)}}>{claims.includes(item.id)?"Kërkuar ✓":"Kërko"}</button>}</div></div>
    </article>)}</section>}
    {!loading&&filtered.length===0&&<div className="empty">Nuk ka ende dhurata që përputhen me kërkimin.</div>}

    {showGive&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setShowGive(false)}><form className="modal" onSubmit={createListing}><div className="modal-head"><div><p className="eyebrow">DHUROJE</p><h2>Posto diçka falas</h2></div><button type="button" className="close" onClick={()=>setShowGive(false)}>×</button></div><label>Çfarë po dhuron?<input name="title" required placeholder={postingCategory==="Ushqim"?"p.sh. 5 pako bukë":"p.sh. karrige, rroba, libra..."}/></label><label>Kategoria<select name="category" value={postingCategory} onChange={e=>setPostingCategory(e.target.value)}>{categories.slice(1).map(x=><option key={x}>{x}</option>)}</select></label>
      <div className="photo-picker"><span className="photo-label">Fotot</span><div className="photo-actions"><label className="photo-button">📁 Zgjidh nga telefoni<input name="photos" type="file" accept="image/*" multiple /></label><label className="photo-button photo-camera">📷 Bëj foto<input name="photos" type="file" accept="image/*" capture="environment" /></label></div><small className="form-help">Mund të zgjedhësh disa foto nga telefoni ose të bësh një foto direkt me kamerën. Deri në 6 foto.</small></div>
      <label>Përshkrimi<textarea name="description" placeholder={postingCategory==="Ushqim"?"Çfarë ushqimi është, sasia dhe kushtet e marrjes...":"Gjendja, madhësia, marka, sasia dhe kushtet e marrjes..."}/></label>
      <label>Disponueshme deri<input name="available_until" type="datetime-local"/></label>
      {postingCategory==="Ushqim"&&<div className="food-fields"><p className="form-section-title">🍎 Informacion për ushqimin</p><label>Afati i ushqimit<input name="food_best_before" type="datetime-local"/></label><div className="check-row"><label><input name="food_refrigerated" type="checkbox"/> Kërkon frigorifer</label><label><input name="food_opened" type="checkbox"/> E hapur</label></div></div>}
      <div className="food-note">📍 {location}. Lejo lokacionin para publikimit nëse dëshiron që shpallja të renditet pranë teje.</div><button className="primary full" type="submit" disabled={posting}>{posting?"Po publikohet…":user?"Publiko falas":"Krijo llogari & publiko"}</button>
    </form></div>}

    {activeListing&&<ListingDetail listing={activeListing} image={images[activeListing.id]?.[0]} saved={favorites.includes(activeListing.id)} claimed={claims.includes(activeListing.id)} isOwner={user?.id===activeListing.owner_id} onClose={()=>setActiveListing(null)} onClaim={()=>claim(activeListing.id)} onSave={()=>toggleFavorite(activeListing.id)} onChat={()=>startChat(activeListing)} onEdit={()=>quickEditListing(activeListing)} onMarkGiven={()=>markAsGiven(activeListing)} onDelete={()=>deleteListing(activeListing)}/>}
    {editingListing&&<EditListingModal listing={editingListing} onClose={()=>setEditingListing(null)} onSaved={async()=>{setEditingListing(null);await load();}}/>}
    {postChoice&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setPostChoice(false)}><div className="modal auth-choice"><div className="modal-head"><div><p className="eyebrow">DHUROJE</p><h2>Si dëshiron të vazhdosh?</h2></div><button type="button" className="close" onClick={()=>setPostChoice(false)}>×</button></div><p className="form-help">Për të dhuruar një gjë, zgjidh nëse ke llogari apo po poston për herë të parë.</p><button className="primary full" onClick={()=>choosePostAuth("login")}>Kam llogari · Hyr</button><button className="secondary full" onClick={()=>choosePostAuth("signup")}>Jam i ri · Krijo llogari</button></div></div>}
    {showAuth&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setShowAuth(false)}><form className="modal" onSubmit={auth}><div className="modal-head"><div><p className="eyebrow">{postAuth?"DHUROJE":"DHUROJE"}</p><h2>{postAuth?(authMode==="login"?"Hyr për të dhuruar":"Krijo llogari për të dhuruar"):(pendingPost?"Krijo llogari":"Krijo llogari")}</h2></div><button type="button" className="close" onClick={()=>{setShowAuth(false);setPostAuth(false);setPendingPost(null)}}>×</button></div>{postAuth&&<p className="form-help">{authMode==="login"?"Hyr me llogarinë tënde dhe pastaj plotëso postimin.":"Krijo llogarinë tënde një herë dhe pastaj plotëso postimin."}</p>}{pendingPost&&<p className="form-help">Postimi yt është ruajtur. Krijo llogarinë dhe do të publikohet menjëherë.</p>}{authMode==="signup"&&<label>Emri<input name="name" required placeholder="Emri yt"/></label>}<label>Email<input name="email" type="email" required/></label><label>Fjalëkalimi<input name="password" type="password" minLength={6} required/></label><button className="primary full" disabled={posting}>{pendingPost?"Krijo llogari & publiko":authMode==="login"?"Hyr":"Krijo llogari"}</button>{!pendingPost&&!postAuth&&<button type="button" className="secondary full" onClick={()=>setAuthMode(authMode==="login"?"signup":"login")}>{authMode==="login"?"Krijo llogari":"Kam llogari"}</button>}{postAuth&&<button type="button" className="secondary full" onClick={()=>setAuthMode(authMode==="login"?"signup":"login")}>{authMode==="login"?"Jam i ri · Krijo llogari":"Kam llogari · Hyr"}</button>}</form></div>}
    {showMessages&&<Messages user={user} onClose={()=>setShowMessages(false)}/>}
    {showDashboard&&<Dashboard user={user} onClose={()=>setShowDashboard(false)} onChanged={load} onChat={(listing,claimantId)=>startChat(listing,claimantId)} onEdit={quickEditListing} onMarkGiven={markAsGiven}/>} 
    <nav className="bottom-nav"><button className="nav-active" onClick={()=>{setMapMode(false);setShowDashboard(false)}}>⌂<span>Eksploro</span></button><button className={favoritesOnly?"nav-active":""} onClick={()=>{if(requireAuth()){setFavoritesOnly(x=>!x);setMapMode(false);}}}>♡<span>Ruajturat</span></button><button onClick={()=>openPosting()} className="nav-add">＋</button><button onClick={()=>requireAuth()&&setShowMessages(true)}>▱<span>Mesazhet</span></button><button onClick={()=>setShowMenu(!showMenu)}>●<span>Profili</span></button></nav>
  </main>;
}

function ListingDetail({listing,image,saved,claimed,isOwner,onClose,onClaim,onSave,onChat,onEdit,onMarkGiven,onDelete}:{listing:Listing;image?:string;saved:boolean;claimed:boolean;isOwner:boolean;onClose:()=>void;onClaim:()=>void;onSave:()=>void;onChat:()=>void;onEdit:()=>void;onMarkGiven:()=>void;onDelete:()=>void}){
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal"><div className="modal-head"><div><p className="eyebrow">{categoryLabel[listing.category]||listing.category}</p><h2>{listing.title}</h2></div><button className="close" onClick={onClose}>×</button></div>{image?<img className="detail-image" src={image} alt=""/>:<div className="detail-emoji">{emoji(listing.category)}</div>}<p>{listing.description||"Pa përshkrim."}</p><p className="poster-line">👤 <strong>{listing.owner?.display_name||"Përdorues i regjistruar"}</strong> · Dhurues</p><p>📍 {listing.location_name||"Pranë teje"}</p><p>🕒 Postuar më {new Date(listing.created_at).toLocaleDateString("sq-AL")}</p>{listing.available_until&&<p>📅 E disponueshme deri më {new Date(listing.available_until).toLocaleString("sq-AL",{dateStyle:"medium",timeStyle:"short"})}</p>}{listing.food_best_before&&<p>🍎 Afati: {new Date(listing.food_best_before).toLocaleDateString("sq-AL")}</p>}{listing.food_refrigerated&&<p>❄️ Kërkon frigorifer</p>}{listing.food_opened&&<p>📦 E hapur</p>}<div className="detail-actions">{isOwner?<><button className="primary" onClick={onEdit}>✏️ Ndrysho shpalljen</button><button className="secondary" onClick={onMarkGiven}>✓ Shëno si të dhuruar</button><button className="secondary danger" onClick={onDelete}>🗑️ Fshi shpalljen</button></>:<><button className="primary" onClick={onClaim}>{claimed?"Hiq kërkesën":"Kërko këtë dhuratë"}</button><button className="secondary" onClick={onChat}>💬 Mesazho dhuruesin</button></>}<button className="secondary" onClick={onSave}>{saved?"♥ Ruajtur":"♡ Ruaje"}</button></div></div></div>;
}

function EditListingModal({listing,onClose,onSaved}:{listing:Listing;onClose:()=>void;onSaved:()=>Promise<void>}){
  const [category,setCategory]=useState(listing.category);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [photos,setPhotos]=useState<any[]>([]);
  const [newFiles,setNewFiles]=useState<File[]>([]);
  const [removePhotoIds,setRemovePhotoIds]=useState<string[]>([]);
  const [locationName,setLocationName]=useState(listing.location_name||"");
  const [lat,setLat]=useState<number|null>(listing.latitude);
  const [lon,setLon]=useState<number|null>(listing.longitude);

  useEffect(()=>{
    supabase.from("dhuroje_listing_images").select("*").eq("listing_id",listing.id).order("sort_order").then(({data})=>{
      setPhotos((data||[]).map((x:any)=>({...x,url:supabase.storage.from("dhuroje-listings").getPublicUrl(x.storage_path).data.publicUrl})));
    });
  },[listing.id]);

  function captureLocation(){
    if(!navigator.geolocation){setError("Ky shfletues nuk mbështet lokacionin.");return;}
    navigator.geolocation.getCurrentPosition(p=>{setLat(p.coords.latitude);setLon(p.coords.longitude);setLocationName("Lokacioni im");},()=>setError("Lokacioni nuk u lejua."));
  }

  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setSaving(true);setError("");
    const f=new FormData(e.currentTarget);
    const categoryValue=String(f.get("category"));
    const isFood=categoryValue==="food";
    const {error:e1}=await supabase.from("dhuroje_listings").update({
      title:String(f.get("title")||"").trim(),
      description:String(f.get("description")||"").trim(),
      category:categoryValue,
      location_name:String(f.get("location_name")||"").trim()||null,
      latitude:lat,longitude:lon,
      available_until:f.get("available_until")?new Date(String(f.get("available_until"))).toISOString():null,
      food_best_before:isFood&&f.get("food_best_before")?new Date(String(f.get("food_best_before"))).toISOString():null,
      food_refrigerated:isFood&&f.get("food_refrigerated")==="on",
      food_opened:isFood&&f.get("food_opened")==="on"
    }).eq("id",listing.id).eq("owner_id",(await supabase.auth.getUser()).data.user?.id||"");
    if(e1){setError(e1.message);setSaving(false);return;}

    const removeRows=photos.filter(x=>removePhotoIds.includes(x.id));
    if(removeRows.length){
      await supabase.from("dhuroje_listing_images").delete().in("id",removeRows.map(x=>x.id));
      await supabase.storage.from("dhuroje-listings").remove(removeRows.map(x=>x.storage_path));
    }
    const remaining=photos.filter(x=>!removePhotoIds.includes(x.id));
    for(let i=0;i<Math.min(newFiles.length,6);i++){
      const file=newFiles[i],ext=file.name.split(".").pop()?.toLowerCase()||"jpg";
      const path=listing.owner_id+"/"+listing.id+"/"+(remaining.length+i)+"-"+crypto.randomUUID()+"."+ext;
      const up=await supabase.storage.from("dhuroje-listings").upload(path,file,{contentType:file.type||"image/jpeg",upsert:false});
      if(up.error){setError(up.error.message);setSaving(false);return;}
      const ins=await supabase.from("dhuroje_listing_images").insert({listing_id:listing.id,storage_path:path,sort_order:remaining.length+i});
      if(ins.error){setError(ins.error.message);setSaving(false);return;}
    }
    setSaving(false);
    await onSaved();
  }

  const localDate=(v:string|null)=>v?new Date(v).toISOString().slice(0,16):"";
  return <div className="modal-backdrop edit-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="modal" onSubmit={save}>
    <div className="modal-head"><div><p className="eyebrow">EDITO SHPALLJEN</p><h2>Ndrysho shpalljen</h2></div><button type="button" className="close" onClick={onClose}>×</button></div>
    {error&&<div className="error">{error}</div>}
    <label>Çfarë po dhuron?<input name="title" defaultValue={listing.title} required /></label>
    <label>Kategoria<select name="category" value={category} onChange={e=>setCategory(e.target.value)}>{categories.slice(1).map(x=><option key={x} value={categoryDb[x]}>{x}</option>)}</select></label>
    <label>Përshkrimi<textarea name="description" defaultValue={listing.description||""}/></label>
    <label>Lokacioni<input name="location_name" value={locationName} onChange={e=>setLocationName(e.target.value)} placeholder="Qyteti / zona" /></label>
    <button type="button" className="secondary full" onClick={captureLocation}>📍 Përdor lokacionin tim</button>
    <label>Disponueshme deri<input name="available_until" type="datetime-local" defaultValue={localDate(listing.available_until)}/></label>
    {category==="food"&&<div className="food-fields"><p className="form-section-title">🍎 Informacion për ushqimin</p><label>Afati i ushqimit<input name="food_best_before" type="datetime-local" defaultValue={localDate(listing.food_best_before)}/></label><div className="check-row"><label><input name="food_refrigerated" type="checkbox" defaultChecked={!!listing.food_refrigerated}/> Kërkon frigorifer</label><label><input name="food_opened" type="checkbox" defaultChecked={!!listing.food_opened}/> E hapur</label></div></div>}
    <div className="photo-picker"><span className="photo-label">Fotot</span>{photos.length>0&&<div className="edit-photo-grid">{photos.map(p=><div className={removePhotoIds.includes(p.id)?"edit-photo removed":"edit-photo"} key={p.id}><img src={p.url} alt="" /><button type="button" onClick={()=>setRemovePhotoIds(x=>x.includes(p.id)?x.filter(id=>id!==p.id):[...x,p.id])}>{removePhotoIds.includes(p.id)?"↩":"×"}</button></div>)}</div>}<label className="photo-button">📷 Shto foto të reja<input type="file" accept="image/*" multiple onChange={e=>setNewFiles(Array.from(e.target.files||[]).slice(0,6))}/></label></div>
    <button className="primary full" disabled={saving}>{saving?"Po ruhet…":"Ruaj ndryshimet"}</button>
  </form></div>;
}

function Messages({user,onClose}:{user:any;onClose:()=>void}){
  const [convos,setConvos]=useState<any[]>([]),[selected,setSelected]=useState<any>(null),[body,setBody]=useState(""),[messages,setMessages]=useState<any[]>([]);
  async function load(){if(!user)return;const {data}=await supabase.from("dhuroje_conversation_members").select("conversation_id").eq("user_id",user.id);const ids=(data||[]).map(x=>x.conversation_id);if(!ids.length){setConvos([]);return;}const {data:cs}=await supabase.from("dhuroje_conversations").select("id,listing_id,created_at").in("id",ids).order("created_at",{ascending:false});setConvos(cs||[]);}
  useEffect(()=>{load();},[]);
  useEffect(()=>{if(!selected)return;supabase.from("dhuroje_messages").select("*").eq("conversation_id",selected.id).order("created_at").then(({data})=>setMessages(data||[]));const ch=supabase.channel("msg-"+selected.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"dhuroje_messages",filter:"conversation_id=eq."+selected.id},(p:any)=>setMessages(x=>[...x,p.new])).subscribe();return()=>{supabase.removeChannel(ch);};},[selected]);
  async function send(){if(!selected||!body.trim())return;const {error}=await supabase.from("dhuroje_messages").insert({conversation_id:selected.id,sender_id:user.id,body:body.trim()});if(error)alert(error.message);setBody("");}
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal messages-modal"><div className="modal-head"><h2>Mesazhet</h2><button className="close" onClick={onClose}>×</button></div>{!convos.length?<div className="empty">Nuk ke ende biseda.</div>:<div className="message-list">{convos.map(c=><button key={c.id} onClick={()=>setSelected(c)}>💬 Bisedë · {new Date(c.created_at).toLocaleDateString("sq-AL")}</button>)}</div>}{selected&&<><div className="chat-messages">{messages.map(m=><div className={m.sender_id===user.id?"bubble mine":"bubble"} key={m.id}>{m.body}<small>{new Date(m.created_at).toLocaleTimeString("sq-AL",{hour:"2-digit",minute:"2-digit"})}</small></div>)}</div><div className="composer"><input value={body} onChange={e=>setBody(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Shkruaj mesazh..."/><button className="primary" onClick={send}>Dërgo</button></div></>}</div></div>;
}

function Dashboard({user,onClose,onChanged,onChat,onEdit,onMarkGiven}:{user:any;onClose:()=>void;onChanged:()=>void;onChat:(listing:Listing,claimantId:string)=>void;onEdit:(listing:Listing)=>void;onMarkGiven:(listing:Listing)=>void}){
  const [tab,setTab]=useState<"my"|"requests">("my"),[mine,setMine]=useState<Listing[]>([]),[incoming,setIncoming]=useState<Claim[]>([]),[busy,setBusy]=useState(false);
  async function load(){
    if(!user)return;
    const {data:ls}=await supabase.from("dhuroje_listings").select("*").eq("owner_id",user.id).order("created_at",{ascending:false});setMine(ls||[]);
    const {data:cs}=await supabase.from("dhuroje_claims").select("*, listing:dhuroje_listings(*), claimant:dhuroje_profiles(display_name)").order("created_at",{ascending:false});setIncoming((cs||[]).filter((x:any)=>x.listing?.owner_id===user.id));
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
  async function deleteListing(listing:Listing){
    if(!window.confirm("Ta fshijmë përgjithmonë këtë shpallje?"))return;
    setBusy(true);
    const {data:deleted,error}=await supabase.rpc("dhuroje_delete_listing",{p_listing_id:listing.id});
    if(error||!deleted)alert(error?.message||"Shpallja nuk u fshi.");
    await load();onChanged();setBusy(false);
  }
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal dashboard"><div className="modal-head"><div><p className="eyebrow">LLOGARIA IME</p><h2>Paneli im</h2></div><button className="close" onClick={onClose}>×</button></div><div className="dash-tabs"><button className={tab==="my"?"active":""} onClick={()=>setTab("my")}>Shpalljet e mia ({mine.length})</button><button className={tab==="requests"?"active":""} onClick={()=>setTab("requests")}>Kërkesat ({incoming.filter(x=>x.status==="pending").length})</button></div>
  {tab==="my"?<div className="dash-list">{mine.length?mine.map(x=><div className="dash-row" key={x.id}><span className="dash-icon">{emoji(x.category)}</span><div><b>{x.title}</b><small>{x.status==="available"?"E disponueshme":x.status==="reserved"?"E rezervuar":x.status==="collected"?"E dhuruar":"Jo aktive"}</small></div>{x.status==="available"&&<><button disabled={busy} onClick={()=>onEdit(x)}>✏️ Ndrysho</button><button disabled={busy} onClick={()=>onMarkGiven(x)}>✓ E dhuruar</button><button disabled={busy} className="danger" onClick={()=>deleteListing(x)}>🗑️ Fshi</button></>}{x.status==="reserved"&&<button disabled={busy} onClick={()=>setListing(x.id,"collected")}>U mor</button>}</div>):<div className="empty">Nuk ke publikuar ende asgjë.</div>}</div>
  :<div className="dash-list">{incoming.length?incoming.map(c=><div className="dash-row" key={c.id}><span className="dash-icon">{emoji(c.listing?.category||"other")}</span><div><b>{c.listing?.title||"Dhuratë"}</b><small>{c.status==="pending"?"Kërkesë e re":c.status} · Nga {c.claimant?.display_name||"përdorues i regjistruar"}</small></div>{c.claimant_id&&<button disabled={busy} onClick={()=>c.listing&&onChat(c.listing,c.claimant_id)}>💬 Mesazho</button>}{c.status==="pending"&&<><button disabled={busy} className="accept" onClick={()=>action(c,"accepted")}>Prano</button><button disabled={busy} onClick={()=>action(c,"declined")}>Refuzo</button></>}</div>):<div className="empty">Nuk ke kërkesa ende.</div>}</div>}</div></div>;
}