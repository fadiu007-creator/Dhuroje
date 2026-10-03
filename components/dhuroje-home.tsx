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
  const [showDashboard,setShowDashboard]=useState(false),[showProfile,setShowProfile]=useState(false),[showNotifications,setShowNotifications]=useState(false),[publicProfileId,setPublicProfileId]=useState<string|null>(null),[notificationCount,setNotificationCount]=useState(0),[activeListing,setActiveListing]=useState<Listing|null>(null),[editingListing,setEditingListing]=useState<Listing|null>(null),[error,setError]=useState("");
  const [authMode,setAuthMode]=useState<"login"|"signup">("login"),[loading,setLoading]=useState(true),[location,setLocation]=useState("Ferizaj");
  const [coords,setCoords]=useState<{lat:number;lon:number}|null>(null),[mapMode,setMapMode]=useState(false),[nearbyOnly,setNearbyOnly]=useState(false),[favoritesOnly,setFavoritesOnly]=useState(false),[sortMode,setSortMode]=useState<"new"|"near">("new");
  const [pageRoute,setPageRoute]=useState<{page:string;id?:string;conversation?:string}>({page:"home"});
  function navigatePage(page:string,id?:string,conversation?:string){
    const params=new URLSearchParams();
    if(page!=="home")params.set("page",page);
    if(id)params.set("id",id);
    if(conversation)params.set("conversation",conversation);
    const url=params.toString()?window.location.pathname+"?"+params.toString():window.location.pathname;
    window.history.pushState({page,id,conversation}, "", url);
    setPageRoute({page,id,conversation});
  }
  function goHome(){navigatePage("home");setActiveListing(null);setPublicProfileId(null);setShowMessages(false);setShowDashboard(false);setShowProfile(false);setShowNotifications(false);}
  useEffect(()=>{
    const sync=()=>{const p=new URLSearchParams(window.location.search);setPageRoute({page:p.get("page")||"home",id:p.get("id")||undefined,conversation:p.get("conversation")||undefined});};
    sync();window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync);
  },[]);

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
    if(sortMode==="near"&&coords)a=[...a].sort((x,y)=>(distanceKm(coords.lat,coords.lon,x.latitude,x.longitude)??9999)-(distanceKm(coords.lat,coords.lon,y.latitude,y.longitude)??9999));
    return a;
  },[listings,category,query,coords,nearbyOnly,favoritesOnly,favorites,sortMode]);

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
  async function signOut(){await supabase.auth.signOut();setShowMenu(false);setShowProfile(false);setShowNotifications(false);await load();}
  async function loadNotificationCount(){
    if(!user){setNotificationCount(0);return;}
    const {count}=await supabase.from("dhuroje_notifications").select("id",{count:"exact",head:true}).eq("recipient_id",user.id).is("read_at",null);
    setNotificationCount(count||0);
  }
  useEffect(()=>{loadNotificationCount();},[user]);
  async function openNotifications(){if(!user){setShowAuth(true);return;}setShowNotifications(true);}
  async function openProfile(){if(!user){setShowAuth(true);return;}setShowProfile(true);}
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
    setMessageConversationId(cid);
    setShowMessages(true);
    navigatePage("messages",undefined,cid);
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

  function toggleMap(){
    if(mapMode){setMapMode(false);return;}
    if(coords){setMapMode(true);return;}
    if(!navigator.geolocation){setError("Ky shfletues nuk mbështet lokacionin.");return;}
    navigator.geolocation.getCurrentPosition(
      p=>{setCoords({lat:p.coords.latitude,lon:p.coords.longitude});setLocation("Lokacioni im");setMapMode(true);},
      ()=>setError("Lokacioni nuk u lejua.")
    );
  }

  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">D</span><span>Dhuroje</span></div><div className="header-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Kërko në Dhuroje..." aria-label="Kërko"/></div><nav className="top-nav"><button className="top-nav-active" onClick={()=>{setFavoritesOnly(false);setMapMode(false)}}>Eksploro</button><button onClick={()=>user?setFavoritesOnly(true):setShowAuth(true)}>Të ruajturat</button></nav><div className="top-actions">
      <button className="header-link" onClick={()=>openPosting()}>＋ Dhuro</button>{user&&<button className="notification-button" aria-label="Njoftimet" onClick={openNotifications}>🔔{notificationCount>0&&<span>{notificationCount>99?"99+":notificationCount}</span>}</button>}<button className="profile-button" aria-label="Profili" onClick={()=>user?openProfile():setShowMenu(!showMenu)}>●</button>
      {showMenu&&<div className="profile-menu">{user?<><strong>{profile?.display_name||user.email}</strong><button onClick={()=>setShowMessages(true)}>💬 Mesazhet</button><button onClick={()=>requireAuth()&&setShowDashboard(true)}>📦 Paneli im</button><button onClick={signOut}>Dil</button></>:<button onClick={()=>setShowAuth(true)}>Hyr / Regjistrohu</button>}</div>}
    </div></header>

    <section className="hero"><div><p className="eyebrow">♻️ TREGU FALAS I KOMUNITETIT</p><h1>Gjej. Merr.<br/><span>Dhuro.</span></h1><p className="hero-copy">Gjërat që nuk të duhen më mund t'i gjejnë një shtëpi të re — falas, pranë teje.</p></div><div className="hero-actions"><button className="primary" onClick={()=>openPosting()}>＋ Dhuro një gjë</button>{user&&<button className="secondary" onClick={()=>setShowDashboard(true)}>Paneli im</button>}</div></section>
    <section className="search-wrap mobile-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Çfarë po kërkon? p.sh. karrige, rroba..."/></section>
    <section className="categories">{categories.map(x=><button key={x} className={category===x?"chip active":"chip"} onClick={()=>setCategory(x)}><span className="chip-icon">{x==="Të gjitha"?"✨":x==="Ushqim"?"🥖":x==="Veshmbathje"?"👕":x==="Shtëpi"?"🪑":x==="Elektronikë"?"📱":x==="Fëmijë"?"🧸":x==="Libra"?"📚":"🎁"}</span><span>{x}</span></button>)}</section>
    <section className="location-row"><div><span className="pin">⌖</span><div><strong>{location}</strong><small>{nearbyOnly?"Brenda 25 km":"Shih çfarë po dhurohet pranë teje"}</small></div></div><div className="location-actions"><button className="filter-button" onClick={locate}>📍 Përdor lokacionin</button><button className="map-toggle" onClick={toggleMap}>🗺️ {mapMode?"Lista":"Harta"}</button></div></section>
    {coords&&<div className="filter-panel"><button onClick={()=>setNearbyOnly(x=>!x)}>{nearbyOnly?"✓ Brenda 25 km":"Pranë meje · 25 km"}</button><span className="nearby-hint">Renditur sipas distancës</span></div>}
    {mapMode&&coords&&<section className="map-panel"><iframe title="Harta e Dhuroje" src={"https://www.openstreetmap.org/export/embed.html?bbox="+(coords.lon-.12)+"%2C"+(coords.lat-.08)+"%2C"+(coords.lon+.12)+"%2C"+(coords.lat+.08)+"&layer=mapnik&marker="+coords.lat+"%2C"+coords.lon}/><div className="map-list">{filtered.slice(0,8).map(x=><button key={x.id} onClick={()=>setActiveListing(x)}>{emoji(x.category)} <span><b>{x.title}</b><small>{x.location_name||"Pranë teje"}{distanceKm(coords.lat,coords.lon,x.latitude,x.longitude)!=null?" · "+distanceKm(coords.lat,coords.lon,x.latitude,x.longitude)!.toFixed(1)+" km":""}</small></span></button>)}</div></section>}

    <section className="section-head"><div><p className="eyebrow">{nearbyOnly?"PRANË MEJE":"DHURATA TË REJA"}</p><h2>{filtered.length} dhurata falas</h2></div><select className="sort-select" value={sortMode} onChange={e=>setSortMode(e.target.value as "new"|"near")}><option value="new">Më të rejat</option><option value="near" disabled={!coords}>Më të afërtat</option></select></section>
    {error&&<div className="error">{error}<button onClick={()=>setError("")}>×</button></div>}
    {!mapMode&&<section className="listing-grid">{filtered.map(item=><article className="card" key={item.id} onClick={()=>{setActiveListing(item);navigatePage("listing",item.id)}}>
      <div className="card-image">{images[item.id]?.[0]?<img src={images[item.id][0]} alt="" />:<span>{emoji(item.category)}</span>}<b>FALAS</b><button className="heart" onClick={e=>{e.stopPropagation();toggleFavorite(item.id)}}>{favorites.includes(item.id)?"♥":"♡"}</button></div>
      <div className="card-body"><div className="meta"><span>{categoryLabel[item.category]||item.category}</span><span>📍 {item.location_name||"Pranë teje"}</span></div><button className="poster-line poster-button" onClick={e=>{e.stopPropagation();setPublicProfileId(item.owner_id);navigatePage("profile",item.owner_id)}}>👤 <strong>{item.owner?.display_name||"Përdorues i regjistruar"}</strong> · Shiko profilin</button><h3>{item.title}</h3><p>{item.description||"Pa përshkrim."}</p>
      <div className="card-footer"><small><button className="poster-name-link" onClick={e=>{e.stopPropagation();setPublicProfileId(item.owner_id);navigatePage("profile",item.owner_id)}}>{item.owner?.display_name||"Përdorues i regjistruar"}</button> · {coords&&distanceKm(coords.lat,coords.lon,item.latitude,item.longitude)!=null?distanceKm(coords.lat,coords.lon,item.latitude,item.longitude)!.toFixed(1)+" km · ":""}{item.available_until?"Deri "+new Date(item.available_until).toLocaleDateString("sq-AL"):"Sapo u postua"}</small>{user?.id!==item.owner_id&&<button className={claims.includes(item.id)?"claimed":"claim"} onClick={e=>{e.stopPropagation();claim(item.id)}}>{claims.includes(item.id)?"Kërkuar ✓":"Kërko"}</button>}</div></div>
    </article>)}</section>}
    {!loading&&filtered.length===0&&<div className="empty">Nuk ka ende dhurata që përputhen me kërkimin.</div>}

    {showGive&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setShowGive(false)}><form className="modal" onSubmit={createListing}><div className="modal-head"><div><p className="eyebrow">DHUROJE</p><h2>Posto diçka falas</h2></div><button type="button" className="close" onClick={()=>setShowGive(false)}>×</button></div><label>Çfarë po dhuron?<input name="title" required placeholder={postingCategory==="Ushqim"?"p.sh. 5 pako bukë":"p.sh. karrige, rroba, libra..."}/></label><label>Kategoria<select name="category" value={postingCategory} onChange={e=>setPostingCategory(e.target.value)}>{categories.slice(1).map(x=><option key={x}>{x}</option>)}</select></label>
      <div className="photo-picker"><span className="photo-label">Fotot</span><div className="photo-actions"><label className="photo-button">📁 Zgjidh nga telefoni<input name="photos" type="file" accept="image/*" multiple /></label><label className="photo-button photo-camera">📷 Bëj foto<input name="photos" type="file" accept="image/*" capture="environment" /></label></div><small className="form-help">Mund të zgjedhësh disa foto nga telefoni ose të bësh një foto direkt me kamerën. Deri në 6 foto.</small></div>
      <label>Përshkrimi<textarea name="description" placeholder={postingCategory==="Ushqim"?"Çfarë ushqimi është, sasia dhe kushtet e marrjes...":"Gjendja, madhësia, marka, sasia dhe kushtet e marrjes..."}/></label>
      <label>Disponueshme deri<input name="available_until" type="datetime-local"/></label>
      {postingCategory==="Ushqim"&&<div className="food-fields"><p className="form-section-title">🍎 Informacion për ushqimin</p><label>Afati i ushqimit<input name="food_best_before" type="datetime-local"/></label><div className="check-row"><label><input name="food_refrigerated" type="checkbox"/> Kërkon frigorifer</label><label><input name="food_opened" type="checkbox"/> E hapur</label></div></div>}
      <div className="food-note">📍 {location}. Lejo lokacionin para publikimit nëse dëshiron që shpallja të renditet pranë teje.</div><button className="primary full" type="submit" disabled={posting}>{posting?"Po publikohet…":user?"Publiko falas":"Krijo llogari & publiko"}</button>
    </form></div>}

    {activeListing&&<div className="route-shell"><ListingDetail listing={activeListing} image={images[activeListing.id]?.[0]} saved={favorites.includes(activeListing.id)} claimed={claims.includes(activeListing.id)} isOwner={user?.id===activeListing.owner_id} onClose={goHome} onClaim={()=>claim(activeListing.id)} onSave={()=>toggleFavorite(activeListing.id)} onChat={()=>startChat(activeListing)} onEdit={()=>quickEditListing(activeListing)} onMarkGiven={()=>markAsGiven(activeListing)} onDelete={()=>deleteListing(activeListing)} onProfile={()=>setPublicProfileId(activeListing.owner_id)}/>}
    {editingListing&&<EditListingModal listing={editingListing} onClose={()=>setEditingListing(null)} onSaved={async()=>{setEditingListing(null);await load();}}/>}
    {postChoice&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setPostChoice(false)}><div className="modal auth-choice"><div className="modal-head"><div><p className="eyebrow">DHUROJE</p><h2>Si dëshiron të vazhdosh?</h2></div><button type="button" className="close" onClick={()=>setPostChoice(false)}>×</button></div><p className="form-help">Për të dhuruar një gjë, zgjidh nëse ke llogari apo po poston për herë të parë.</p><button className="primary full" onClick={()=>choosePostAuth("login")}>Kam llogari · Hyr</button><button className="secondary full" onClick={()=>choosePostAuth("signup")}>Jam i ri · Krijo llogari</button></div></div>}
    {showAuth&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setShowAuth(false)}><form className="modal" onSubmit={auth}><div className="modal-head"><div><p className="eyebrow">{postAuth?"DHUROJE":"DHUROJE"}</p><h2>{postAuth?(authMode==="login"?"Hyr për të dhuruar":"Krijo llogari për të dhuruar"):(pendingPost?"Krijo llogari":"Krijo llogari")}</h2></div><button type="button" className="close" onClick={()=>{setShowAuth(false);setPostAuth(false);setPendingPost(null)}}>×</button></div>{postAuth&&<p className="form-help">{authMode==="login"?"Hyr me llogarinë tënde dhe pastaj plotëso postimin.":"Krijo llogarinë tënde një herë dhe pastaj plotëso postimin."}</p>}{pendingPost&&<p className="form-help">Postimi yt është ruajtur. Krijo llogarinë dhe do të publikohet menjëherë.</p>}{authMode==="signup"&&<label>Emri<input name="name" required placeholder="Emri yt"/></label>}<label>Email<input name="email" type="email" required/></label><label>Fjalëkalimi<input name="password" type="password" minLength={6} required/></label><button className="primary full" disabled={posting}>{pendingPost?"Krijo llogari & publiko":authMode==="login"?"Hyr":"Krijo llogari"}</button>{!pendingPost&&!postAuth&&<button type="button" className="secondary full" onClick={()=>setAuthMode(authMode==="login"?"signup":"login")}>{authMode==="login"?"Krijo llogari":"Kam llogari"}</button>}{postAuth&&<button type="button" className="secondary full" onClick={()=>setAuthMode(authMode==="login"?"signup":"login")}>{authMode==="login"?"Jam i ri · Krijo llogari":"Kam llogari · Hyr"}</button>}</form></div>}
    {showMessages&&<div className="route-shell"><Messages user={user} initialConversationId={messageConversationId} onClose={goHome}/></div>} {showNotifications&&<Notifications user={user} onClose={()=>setShowNotifications(false)} onChanged={loadNotificationCount}/>} {showProfile&&<ProfileModal user={user} onClose={()=>setShowProfile(false)} onChanged={loadNotificationCount}/>} {publicProfileId&&<div className="route-shell"><PublicProfileModal userId={publicProfileId} onClose={goHome} onListing={(listing,image)=>{setActiveListing(listing);if(image)setImages(prev=>({...prev,[listing.id]:[image,...(prev[listing.id]||[])]}));navigatePage("listing",listing.id);}}/></div>}
    {showDashboard&&<div className="route-shell"><Dashboard user={user} onClose={goHome} onChanged={load} onChat={(listing,claimantId)=>startChat(listing,claimantId)} onEdit={quickEditListing} onMarkGiven={markAsGiven}/></div>} 
    <nav className="bottom-nav"><button className="nav-active" onClick={()=>{setMapMode(false);setShowDashboard(false)}}>⌂<span>Eksploro</span></button><button className={favoritesOnly?"nav-active":""} onClick={()=>{if(requireAuth()){setFavoritesOnly(x=>!x);setMapMode(false);}}}>♡<span>Ruajturat</span></button><button onClick={()=>openPosting()} className="nav-add">＋</button><button onClick={()=>requireAuth()&&setShowMessages(true)}>▱<span>Mesazhet</span></button><button onClick={()=>setShowMenu(!showMenu)}>●<span>Profili</span></button></nav>
  </main>;
}

function PublicProfileModal({userId,onClose,onChat,onListing}:{userId:string;onClose:()=>void;onChat?:()=>void;onListing?:(listing:Listing,image?:string)=>void}){
  const [profile,setProfile]=useState<any>(null),[reviews,setReviews]=useState<any[]>([]),[posts,setPosts]=useState<Listing[]>([]),[postImages,setPostImages]=useState<Record<string,string>>({});
  useEffect(()=>{(async()=>{const [p,r,l]=await Promise.all([
    supabase.from("dhuroje_profiles").select("*").eq("id",userId).maybeSingle(),
    supabase.from("dhuroje_reviews").select("*").eq("reviewed_id",userId).order("created_at",{ascending:false}),
    supabase.from("dhuroje_listings").select("*, owner:dhuroje_profiles!dhuroje_listings_owner_id_fkey(id,display_name,avatar_url)").eq("owner_id",userId).in("status",["available","reserved"]).order("created_at",{ascending:false})
  ]);const ids=[...new Set((r.data||[]).map((x:any)=>x.reviewer_id))];const {data:rp}=ids.length?await supabase.from("dhuroje_profiles").select("id,display_name").in("id",ids):{data:[] as any[]};const map=Object.fromEntries((rp||[]).map((x:any)=>[x.id,x]));const ls=(l.data||[]) as Listing[];if(ls.length){const {data:ims}=await supabase.from("dhuroje_listing_images").select("listing_id,storage_path,sort_order").in("listing_id",ls.map(x=>x.id)).order("sort_order");const first:Record<string,string>={};(ims||[]).forEach((im:any)=>{if(!first[im.listing_id])first[im.listing_id]=supabase.storage.from("dhuroje-listings").getPublicUrl(im.storage_path).data.publicUrl;});setPostImages(first);}setProfile(p.data);setReviews((r.data||[]).map((x:any)=>({...x,reviewer:map[x.reviewer_id]})));setPosts(ls);})()},[userId]);
  const avg=reviews.length?reviews.reduce((s,r)=>s+r.rating,0)/reviews.length:0;
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal profile-modal">
    <div className="modal-head"><div><p className="eyebrow">DHURUESI</p><h2>{profile?.display_name||"Përdorues i regjistruar"}</h2><small>{profile?.created_at?"Anëtar që nga "+new Date(profile.created_at).toLocaleDateString("sq-AL"):""}</small></div><button className="close" onClick={onClose}>×</button></div>
    <div className="profile-stats"><div><b>{posts.length}</b><small>shpallje aktive</small></div><div><b>{reviews.length}</b><small>vlerësime</small></div><div><b>{avg?avg.toFixed(1):"—"}</b><small>⭐ mesatare</small></div></div>
    {onChat&&<button className="secondary full" onClick={onChat}>💬 Mesazho</button>}
    <div className="profile-posts"><h3>Shpalljet e këtij dhuruesi</h3>{posts.length?<div className="public-profile-posts">{posts.map(x=><button className="public-profile-post" key={x.id} onClick={()=>onListing?.(x,postImages[x.id])}><span className="public-profile-post-image">{postImages[x.id]?<img src={postImages[x.id]} alt=""/>:<span>{emoji(x.category)}</span>}</span><span><b>{x.title}</b><small>{categoryLabel[x.category]||x.category} · {x.location_name||"Pranë teje"}</small><small>{x.status==="reserved"?"E rezervuar":"E disponueshme"}</small></span></button>)}</div>:<div className="empty">Ky dhurues nuk ka shpallje aktive.</div>}</div>
    <div className="profile-reviews"><h3>Vlerësimet</h3>{reviews.length?reviews.map(r=><div className="review-row" key={r.id}><div><b>{r.reviewer?.display_name||"Përdorues"}</b><span>{"★".repeat(r.rating)}{"☆".repeat(5-r.rating)}</span></div><p>{r.comment||"Pa koment."}</p></div>):<div className="empty">Nuk ka ende vlerësime.</div>}</div>
  </div></div>;
}

function ListingDetail({listing,image,saved,claimed,isOwner,onClose,onClaim,onSave,onChat,onEdit,onMarkGiven,onDelete,onProfile}:{listing:Listing;image?:string;saved:boolean;claimed:boolean;isOwner:boolean;onClose:()=>void;onClaim:()=>void;onSave:()=>void;onChat:()=>void;onEdit:()=>void;onMarkGiven:()=>void;onDelete:()=>void;onProfile:()=>void}){
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal"><div className="modal-head"><div><p className="eyebrow">{categoryLabel[listing.category]||listing.category}</p><h2>{listing.title}</h2></div><button className="close" onClick={onClose}>×</button></div>{image?<img className="detail-image" src={image} alt=""/>:<div className="detail-emoji">{emoji(listing.category)}</div>}<p>{listing.description||"Pa përshkrim."}</p><button className="poster-line poster-button" onClick={onProfile}>👤 <strong>{listing.owner?.display_name||"Përdorues i regjistruar"}</strong> · Dhurues</button><p>📍 {listing.location_name||"Pranë teje"}</p><p>🕒 Postuar më {new Date(listing.created_at).toLocaleDateString("sq-AL")}</p>{listing.available_until&&<p>📅 E disponueshme deri më {new Date(listing.available_until).toLocaleString("sq-AL",{dateStyle:"medium",timeStyle:"short"})}</p>}{listing.food_best_before&&<p>🍎 Afati: {new Date(listing.food_best_before).toLocaleDateString("sq-AL")}</p>}{listing.food_refrigerated&&<p>❄️ Kërkon frigorifer</p>}{listing.food_opened&&<p>📦 E hapur</p>}<div className="detail-actions">{isOwner?<><button className="primary" onClick={onEdit}>✏️ Ndrysho shpalljen</button><button className="secondary" onClick={onMarkGiven}>✓ Shëno si të dhuruar</button><button className="secondary danger" onClick={onDelete}>🗑️ Fshi shpalljen</button></>:<><button className="primary" onClick={onClaim}>{claimed?"Hiq kërkesën":"Kërko këtë dhuratë"}</button><button className="secondary" onClick={onChat}>💬 Mesazho dhuruesin</button></>}<button className="secondary" onClick={onSave}>{saved?"♥ Ruajtur":"♡ Ruaje"}</button></div></div></div>;
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

function Notifications({user,onClose,onChanged}:{user:any;onClose:()=>void;onChanged:()=>void}){
  const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true);
  async function load(){
    setLoading(true);
    const {data}=await supabase.from("dhuroje_notifications").select("*").eq("recipient_id",user.id).order("created_at",{ascending:false}).limit(50);
    setRows(data||[]);setLoading(false);
  }
  useEffect(()=>{load();},[user]);
  async function markRead(id?:string){
    const q=supabase.from("dhuroje_notifications").update({read_at:new Date().toISOString()}).eq("recipient_id",user.id).is("read_at",null);
    if(id) await supabase.from("dhuroje_notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("recipient_id",user.id);
    else await q;
    await load();onChanged();
  }
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <div className="modal notifications-modal">
      <div className="modal-head"><div><p className="eyebrow">AKTIVITETI</p><h2>Njoftimet</h2></div><div className="modal-head-actions"><button className="text-button" onClick={()=>markRead()}>Shëno të gjitha si të lexuara</button><button className="close" onClick={onClose}>×</button></div></div>
      {loading?<div className="empty">Po ngarkohen…</div>:!rows.length?<div className="empty">Nuk ke njoftime ende.</div>:<div className="notification-list">{rows.map(n=><button key={n.id} className={n.read_at?"notification read":"notification"} onClick={()=>markRead(n.id)}><span className="notification-icon">{n.type==="message"?"💬":n.type==="claim"?"🙋":n.type==="pickup"?"📅":n.type==="completed"?"🎉":n.type==="review"?"⭐":"🔔"}</span><span><b>{n.title}</b><small>{n.body}</small><small>{new Date(n.created_at).toLocaleString("sq-AL",{dateStyle:"short",timeStyle:"short"})}</small></span></button>)}</div>}
    </div>
  </div>;
}

function ProfileModal({user,onClose,onChanged}:{user:any;onClose:()=>void;onChanged:()=>void}){
  const [profile,setProfile]=useState<any>(null),[reviews,setReviews]=useState<any[]>([]),[stats,setStats]=useState({active:0,given:0}),[name,setName]=useState(""),[saving,setSaving]=useState(false);
  async function load(){
    const [p,r,l]=await Promise.all([
      supabase.from("dhuroje_profiles").select("*").eq("id",user.id).maybeSingle(),
      supabase.from("dhuroje_reviews").select("*").eq("reviewed_id",user.id).order("created_at",{ascending:false}),
      supabase.from("dhuroje_listings").select("status").eq("owner_id",user.id)
    ]);
    const reviewerIds=[...new Set((r.data||[]).map((x:any)=>x.reviewer_id))];
    const {data:reviewerProfiles}=reviewerIds.length?await supabase.from("dhuroje_profiles").select("id,display_name").in("id",reviewerIds):{data:[] as any[]};
    const rp=Object.fromEntries((reviewerProfiles||[]).map((x:any)=>[x.id,x]));
    setProfile(p.data);setName(p.data?.display_name||"");setReviews((r.data||[]).map((x:any)=>({...x,reviewer:rp[x.reviewer_id]})));
    setStats({active:(l.data||[]).filter((x:any)=>x.status==="available").length,given:(l.data||[]).filter((x:any)=>x.status==="collected").length});
  }
  useEffect(()=>{load();},[user]);
  async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();setSaving(true);const {error}=await supabase.from("dhuroje_profiles").upsert({id:user.id,display_name:name.trim()||user.email?.split("@")[0]||"Përdorues"});if(error)alert(error.message);else{await load();onChanged();}setSaving(false);}
  const avg=reviews.length?reviews.reduce((s,r)=>s+r.rating,0)/reviews.length:0;
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <div className="modal profile-modal">
      <div className="modal-head"><div><p className="eyebrow">PROFILI IM</p><h2>{profile?.display_name||"Përdorues"}</h2><small>Anëtar që nga {profile?.created_at?new Date(profile.created_at).toLocaleDateString("sq-AL"):new Date(user.created_at).toLocaleDateString("sq-AL")}</small></div><button className="close" onClick={onClose}>×</button></div>
      <form className="profile-form" onSubmit={save}><label>Emri që shfaqet<input value={name} onChange={e=>setName(e.target.value)} maxLength={60}/></label><button className="secondary full" disabled={saving}>{saving?"Po ruhet…":"Ruaj profilin"}</button></form>
      <div className="profile-stats"><div><b>{stats.active}</b><small>aktive</small></div><div><b>{stats.given}</b><small>të dhuruara</small></div><div><b>{avg?avg.toFixed(1):"—"}</b><small>⭐ {reviews.length} vlerësime</small></div></div>
      <div className="profile-reviews"><h3>Vlerësimet</h3>{reviews.length?reviews.map(r=><div className="review-row" key={r.id}><div><b>{r.reviewer?.display_name||"Përdorues"}</b><span>{"★".repeat(r.rating)}{"☆".repeat(5-r.rating)}</span></div><p>{r.comment||"Pa koment."}</p><small>{new Date(r.created_at).toLocaleDateString("sq-AL")}</small></div>):<div className="empty">Nuk ke marrë ende vlerësime. Pas një marrjeje të përfunduar, mund të vlerësoheni nga njëri-tjetri.</div>}</div>
    </div>
  </div>;
}

function ReviewModal({user,targetId,listingId,listingTitle,onClose,onSaved}:{user:any;targetId:string;listingId:string;listingTitle:string;onClose:()=>void;onSaved:()=>void}){
  const [rating,setRating]=useState(5),[comment,setComment]=useState(""),[saving,setSaving]=useState(false);
  async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();setSaving(true);const {error}=await supabase.from("dhuroje_reviews").insert({reviewer_id:user.id,reviewed_id:targetId,listing_id:listingId,rating,comment:comment.trim()||null});if(error)alert(error.code==="23505"?"E ke vlerësuar tashmë këtë dhurojë.":error.message);else{onSaved();onClose();}setSaving(false);}
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="modal review-modal" onSubmit={save}><div className="modal-head"><div><p className="eyebrow">PAS MARRJES</p><h2>Vlerëso dhurojën</h2><small>{listingTitle}</small></div><button type="button" className="close" onClick={onClose}>×</button></div><div className="rating-picker">{[1,2,3,4,5].map(n=><button type="button" key={n} className={n<=rating?"selected":""} onClick={()=>setRating(n)}>★</button>)}</div><label>Komenti<textarea value={comment} onChange={e=>setComment(e.target.value)} maxLength={500} placeholder="Si ishte përvoja?"/></label><button className="primary full" disabled={saving}>{saving?"Po ruhet…":"Publiko vlerësimin"}</button></form></div>;
}

function Messages({user,onClose,initialConversationId}:{user:any;onClose:()=>void;initialConversationId?:string}){
  const [conversations,setConversations]=useState<any[]>([]);
  const [messages,setMessages]=useState<any[]>([]);
  const [selectedConversation,setSelectedConversation]=useState<string>("");
  const [body,setBody]=useState("");
  const [loading,setLoading]=useState(true);
  const [targetConversation,setTargetConversation]=useState<string>(initialConversationId||"");

  async function load(){
    if(!user)return;
    setLoading(true);
    const {data:members,error:memberError}=await supabase
      .from("dhuroje_conversation_members")
      .select("conversation_id")
      .eq("user_id",user.id);
    if(memberError){setLoading(false);return;}

    const ids=(members||[]).map((x:any)=>x.conversation_id);
    if(!ids.length){
      setConversations([]);
      setMessages([]);
      setSelectedConversation("");
      setLoading(false);
      return;
    }

    const {data:cs}=await supabase
      .from("dhuroje_conversations")
      .select("id,listing_id,created_at")
      .in("id",ids)
      .order("created_at",{ascending:false});

    const rows=cs||[];
    const listingIds=rows.map((x:any)=>x.listing_id).filter(Boolean);
    const {data:listingsData}=listingIds.length
      ?await supabase.from("dhuroje_listings").select("id,title,owner_id").in("id",listingIds)
      :{data:[] as any[]};

    const {data:allMembers}=await supabase
      .from("dhuroje_conversation_members")
      .select("conversation_id,user_id")
      .in("conversation_id",ids);

    const otherIds=(allMembers||[])
      .filter((m:any)=>m.user_id!==user.id)
      .map((m:any)=>m.user_id);
    const {data:profiles}=otherIds.length
      ?await supabase.from("dhuroje_profiles").select("id,display_name").in("id",[...new Set(otherIds)])
      :{data:[] as any[]};

    const listingMap=Object.fromEntries((listingsData||[]).map((x:any)=>[x.id,x]));
    const profileMap=Object.fromEntries((profiles||[]).map((x:any)=>[x.id,x]));
    const otherByConversation:Record<string,string>={};
    (allMembers||[]).forEach((m:any)=>{
      if(m.user_id!==user.id)otherByConversation[m.conversation_id]=m.user_id;
    });

    const {data:ms}=await supabase
      .from("dhuroje_messages")
      .select("*")
      .in("conversation_id",ids)
      .order("created_at",{ascending:true});
    const sentOrReceivedIds=new Set((ms||[]).map((m:any)=>m.conversation_id));

    // Only show conversations where an actual message has been sent or received.
    const enriched=rows
      .filter((c:any)=>sentOrReceivedIds.has(c.id))
      .map((c:any)=>({
        ...c,
        listingTitle:listingMap[c.listing_id]?.title||"Dhuratë",
        otherUserId:otherByConversation[c.id],
        otherName:profileMap[otherByConversation[c.id]]?.display_name||"Përdorues"
      }));
    setConversations(enriched);
    setMessages(ms||[]);

    setSelectedConversation(current=>{
      const preferred=initialConversationId&&enriched.some(c=>c.id===initialConversationId)?initialConversationId:"";
      if(preferred)return preferred;
      if(current&&enriched.some(c=>c.id===current))return current;
      return enriched[0]?.id||"";
    });
    if(initialConversationId&&enriched.some(c=>c.id===initialConversationId))setTargetConversation(initialConversationId);
    setLoading(false);
  }

  useEffect(()=>{load();},[user]);

  useEffect(()=>{
    if(!user)return;
    const ch=supabase.channel("all-user-messages-"+user.id)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"dhuroje_messages"},()=>load())
      .subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[user]);

  const selectedMessages=messages.filter(m=>m.conversation_id===selectedConversation);
  const selected=conversations.find(c=>c.id===selectedConversation);

  async function send(){
    const text=body.trim();
    if(!selectedConversation||!text)return;
    const {error}=await supabase.from("dhuroje_messages").insert({
      conversation_id:selectedConversation,
      sender_id:user.id,
      body:text
    });
    if(error)alert(error.message);
    else{
      setBody("");
      await load();
    }
  }

  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <div className="modal messages-modal">
      <div className="modal-head">
        <div><p className="eyebrow">MESAZHET</p><h2>Mesazhet</h2></div>
        <button className="close" onClick={onClose}>×</button>
      </div>

      {loading?<div className="empty">Po ngarkohen mesazhet…</div>:!conversations.length?
        <div className="empty">Nuk ke ende mesazhe.</div>:
        <>
          {!targetConversation&&<label className="message-context">
            <span>Postimi / kërkesa</span>
            <select value={selectedConversation} onChange={e=>setSelectedConversation(e.target.value)}>
              {conversations.map(c=><option key={c.id} value={c.id}>{c.otherName} · {c.listingTitle}</option>)}
            </select>
          </label>}
          {targetConversation&&selected&&<div className="message-person"><span>👤</span><div><b>{selected.otherName}</b><small>{selected.listingTitle}</small></div></div>}

          <div className="chat-messages">
            {selectedMessages.length?selectedMessages.map(m=><div className={m.sender_id===user.id?"bubble mine":"bubble"} key={m.id}>
              {m.body}
              <small>{new Date(m.created_at).toLocaleTimeString("sq-AL",{hour:"2-digit",minute:"2-digit"})}</small>
            </div>):<div className="empty">Nuk ka ende mesazhe për këtë kërkesë.</div>}
          </div>

          <div className="composer">
            <input value={body} onChange={e=>setBody(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder={"Shkruaj për "+(selected?.otherName||"përdoruesin")+"…"} />
            <button className="primary" onClick={send}>Dërgo</button>
          </div>
        </>
      }
    </div>
  </div>;
}
function Dashboard({user,onClose,onChanged,onChat,onEdit,onMarkGiven}:{user:any;onClose:()=>void;onChanged:()=>void;onChat:(listing:Listing,claimantId:string)=>void;onEdit:(listing:Listing)=>void;onMarkGiven:(listing:Listing)=>void}){
  const [tab,setTab]=useState<"my"|"requests"|"wanted">("my");
  const [mine,setMine]=useState<Listing[]>([]),[incoming,setIncoming]=useState<Claim[]>([]),[wanted,setWanted]=useState<Claim[]>([]);
  const [pickups,setPickups]=useState<any[]>([]),[busy,setBusy]=useState(false),[scheduleFor,setScheduleFor]=useState<Claim|null>(null),[reviewFor,setReviewFor]=useState<any>(null);

  async function load(){
    if(!user)return;
    const [{data:ls},{data:cs},{data:myClaims}]=await Promise.all([
      supabase.from("dhuroje_listings").select("*").eq("owner_id",user.id).order("created_at",{ascending:false}),
      supabase.from("dhuroje_claims").select("*, listing:dhuroje_listings(*), claimant:dhuroje_profiles(display_name)").order("created_at",{ascending:false}),
      supabase.from("dhuroje_claims").select("*, listing:dhuroje_listings(*)").eq("claimant_id",user.id).order("created_at",{ascending:false})
    ]);
    setMine(ls||[]);
    const all=(cs||[]) as any[];
    setIncoming(all.filter((x:any)=>x.listing?.owner_id===user.id));
    setWanted((myClaims||[]).filter((x:any)=>x.status!=="cancelled") as any[]);
    const claimIds=[...all.filter((x:any)=>x.listing?.owner_id===user.id).map((x:any)=>x.id),...(myClaims||[]).map((x:any)=>x.id)];
    if(claimIds.length){
      const {data:ps}=await supabase.from("dhuroje_pickups").select("*").in("claim_id",[...new Set(claimIds)]).order("scheduled_at",{ascending:true});
      setPickups(ps||[]);
    }else setPickups([]);
  }
  useEffect(()=>{load();},[]);

  async function action(c:Claim,status:string){
    setBusy(true);let error:any=null;
    if(status==="accepted"){const result=await supabase.rpc("dhuroje_accept_claim",{p_claim_id:c.id});error=result.error;}
    else{const result=await supabase.from("dhuroje_claims").update({status}).eq("id",c.id);error=result.error;if(!error&&status==="collected"){const r=await supabase.from("dhuroje_listings").update({status:"collected"}).eq("id",c.listing_id).eq("owner_id",user.id);error=r.error;}}
    if(!error){await load();onChanged();}else alert(error.message);setBusy(false);
  }
  async function withdrawRequest(c:Claim){
    if(c.status!=="pending")return;if(!window.confirm("Ta tërheqim këtë kërkesë?"))return;
    setBusy(true);
    const {data:removed,error}=await supabase.from("dhuroje_claims").update({status:"cancelled"}).eq("id",c.id).eq("claimant_id",user.id).eq("status","pending").select("id").maybeSingle();
    if(error)alert(error.message);
    else if(!removed)alert("Kërkesa nuk u gjet ose nuk mund të tërhiqet më.");
    else{await load();onChanged();}
    setBusy(false);
  }

  const pickupFor=(claimId:string)=>pickups.find(p=>p.claim_id===claimId);

  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <div className="modal dashboard">
      <div className="modal-head"><div><p className="eyebrow">LLOGARIA IME</p><h2>Paneli im</h2></div><button className="close" onClick={onClose}>×</button></div>
      <div className="dash-tabs">
        <button className={tab==="my"?"active":""} onClick={()=>setTab("my")}>Shpalljet e mia ({mine.length})</button>
        <button className={tab==="requests"?"active":""} onClick={()=>setTab("requests")}>Kërkesat ({incoming.filter(x=>x.status==="pending").length})</button>
        <button className={tab==="wanted"?"active":""} onClick={()=>setTab("wanted")}>Të kërkuarat ({wanted.length})</button>
      </div>

      {tab==="my"&&<div className="dash-list">
        {mine.length?mine.map(x=><div className="dash-row" key={x.id}>
          <span className="dash-icon">{emoji(x.category)}</span><div><b>{x.title}</b><small>{x.status==="available"?"E disponueshme":x.status==="reserved"?"E rezervuar":x.status==="collected"?"E dhuruar":"Jo aktive"}</small></div>
          {x.status==="available"&&<><button disabled={busy} onClick={()=>onEdit(x)}>✏️ Ndrysho</button><button disabled={busy} onClick={()=>onMarkGiven(x)}>✓ E dhuruar</button><button disabled={busy} className="danger" onClick={()=>deleteListing(x)}>🗑️ Fshi</button></>}
          {x.status==="reserved"&&<button disabled={busy} onClick={()=>setListing(x.id,"collected")}>✓ U mor</button>}
        </div>):<div className="empty">Nuk ke publikuar ende asgjë.</div>}
      </div>}

      {tab==="requests"&&<div className="dash-list">
        {incoming.length?incoming.map(c=>{
          const p=pickupFor(c.id);
          return <div className="dash-row" key={c.id}>
            <span className="dash-icon">{emoji(c.listing?.category||"other")}</span>
            <div><b>{c.listing?.title||"Dhuratë"}</b><small>{c.status==="pending"?"Kërkesë e re":c.status} · Nga {c.claimant?.display_name||"përdorues i regjistruar"}{p?.scheduled_at?" · Marrja: "+new Date(p.scheduled_at).toLocaleString("sq-AL",{dateStyle:"short",timeStyle:"short"}):""}</small></div>
            {c.claimant_id&&<button disabled={busy} onClick={()=>c.listing&&onChat(c.listing,c.claimant_id)}>💬 Mesazho</button>}
            {c.status==="pending"&&<><button disabled={busy} className="accept" onClick={()=>action(c,"accepted")}>Prano</button><button disabled={busy} onClick={()=>action(c,"declined")}>Refuzo</button></>}
            {c.status==="accepted"&&<><button disabled={busy} onClick={()=>setScheduleFor(c)}>📅 Cakto marrjen</button>{p?.status==="confirmed"&&<button disabled={busy} onClick={()=>updatePickup(p,"completed")}>✓ U mor</button>}{p?.status==="completed"&&<button disabled={busy} onClick={()=>setReviewFor({targetId:c.claimant_id,listingId:c.listing_id,title:c.listing?.title||"Dhuratë"})}>⭐ Vlerëso</button>}</>}
          </div>
        }):<div className="empty">Nuk ke kërkesa ende.</div>}
      </div>}

      {tab==="wanted"&&<div className="dash-list">
        {wanted.length?wanted.map((c:any)=>{
          const p=pickupFor(c.id);
          return <div className="dash-row" key={c.id}>
            <span className="dash-icon">{emoji(c.listing?.category||"other")}</span>
            <div><b>{c.listing?.title||"Dhuratë"}</b><small>{c.status==="pending"?"Në pritje":c.status==="accepted"?"Pranuar":c.status==="declined"?"Refuzuar":c.status}{p?.scheduled_at?" · Marrja: "+new Date(p.scheduled_at).toLocaleString("sq-AL",{dateStyle:"short",timeStyle:"short"}):""}</small></div>
            {c.status==="pending"&&<button disabled={busy} className="danger" onClick={()=>withdrawRequest(c)}>↩ Tërhiq kërkesën</button>}
            {c.status==="accepted"&&p?.status==="proposed"&&<button disabled={busy} className="accept" onClick={()=>updatePickup(p,"confirmed")}>✓ Konfirmo marrjen</button>}
            {c.status==="accepted"&&!p&&<button disabled={busy} onClick={()=>onChat(c.listing,c.listing?.owner_id)}>💬 Kontakto</button>}{p?.status==="completed"&&<button disabled={busy} onClick={()=>setReviewFor({targetId:c.listing?.owner_id,listingId:c.listing_id,title:c.listing?.title||"Dhuratë"})}>⭐ Vlerëso</button>}
          </div>
        }):<div className="empty">Nuk ke kërkuar ende ndonjë dhuratë.</div>}
      </div>}

      {reviewFor&&<ReviewModal user={user} targetId={reviewFor.targetId} listingId={reviewFor.listingId} listingTitle={reviewFor.title} onClose={()=>setReviewFor(null)} onSaved={async()=>{setReviewFor(null);await load();onChanged();}}/>}
      {scheduleFor&&<div className="pickup-inline">
        <div className="modal-head"><div><p className="eyebrow">TAKIMI</p><h3>Cakto marrjen</h3></div><button className="close" onClick={()=>setScheduleFor(null)}>×</button></div>
        <form id="pickup-form" onSubmit={e=>{e.preventDefault();schedulePickup(scheduleFor)}}>
          <label>Kur<input name="scheduled_at" type="datetime-local" required defaultValue={pickupFor(scheduleFor.id)?.scheduled_at?new Date(pickupFor(scheduleFor.id).scheduled_at).toISOString().slice(0,16):""}/></label>
          <label>Ku<input name="location" required defaultValue={pickupFor(scheduleFor.id)?.location||scheduleFor.listing?.location_name||""} placeholder="Qyteti / vendi i marrjes"/></label>
          <label>Shënim<textarea name="notes" defaultValue={pickupFor(scheduleFor.id)?.notes||""} placeholder="P.sh. hyrja, kati, numri i telefonit..."/></label>
          <button className="primary full" disabled={busy}>{busy?"Po ruhet…":"Dërgo propozimin e marrjes"}</button>
        </form>
      </div>}
    </div>
  </div>;
}
