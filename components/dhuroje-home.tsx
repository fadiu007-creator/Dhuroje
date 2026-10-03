'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Category = "Të gjitha" | "Ushqim" | "Veshmbathje" | "Shtëpi" | "Elektronikë" | "Fëmijë" | "Libra" | "Të tjera";
type Listing = {
  id:string; owner_id:string; title:string; description:string; category:string; status:string;
  location_name:string|null; latitude:number|null; longitude:number|null; food_refrigerated:boolean|null; food_opened:boolean|null; created_at:string;
  owner?:{display_name:string|null; avatar_url?:string|null}|null;
};
type Image = { id:string; listing_id:string; storage_path:string; sort_order:number };
type Claim = { id:string; listing_id:string; claimant_id:string; status:string; created_at:string; listing?:Listing; claimant?:{display_name:string} };

const categories:Category[]=["Të gjitha","Ushqim","Veshmbathje","Shtëpi","Elektronikë","Fëmijë","Libra","Të tjera"];
const cities=["Prishtinë","Prizren","Pejë","Ferizaj","Gjilan","Gjakovë","Mitrovicë","Vushtrri","Podujevë","Fushë Kosovë","Lipjan","Suharekë","Rahovec","Drenas","Skenderaj","Kamenicë","Viti","Istog","Deçan","Klinë","Malishevë","Dragash","Kaçanik","Shtime","Obiliq","Graçanicë","Tiranë","Durrës","Vlorë","Shkodër","Elbasan","Fier","Korçë","Berat","Lushnjë","Kukës","Lezhë","Pogradec"];
const categoryDb:Record<string,string>={Ushqim:"food",Veshmbathje:"clothing",Shtëpi:"home",Elektronikë:"electronics",Fëmijë:"kids",Libra:"books","Të tjera":"other"};
const categoryLabel:Record<string,string>={food:"Ushqim",clothing:"Veshmbathje",home:"Shtëpi",electronics:"Elektronikë",kids:"Fëmijë",books:"Libra",other:"Të tjera"};
const emoji=(c:string)=>({food:"🥖",clothing:"👕",home:"🪑",electronics:"📱",kids:"🧸",books:"📚",other:"🎁"} as Record<string,string>)[c]||"🎁";

async function compressImage(file:File,maxDimension=900,maxBytes=500*1024):Promise<File|null>{
  if(!file.type.startsWith("image/"))return null;
  if(file.size>15*1024*1024)throw new Error("Fotoja origjinale duhet të jetë maksimumi 15 MB.");
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height));
  const width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d");
  if(!ctx){bitmap.close();throw new Error("Nuk mund të përpunohej fotoja.");}
  ctx.drawImage(bitmap,0,0,width,height);
  bitmap.close();
  const makeBlob=(type:string,quality:number)=>new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,type,quality));
  let blob:Blob|null=null;
  for(const quality of [0.82,0.74,0.66,0.58,0.50,0.42]){
    blob=await makeBlob("image/webp",quality);
    if(blob&&blob.size<=maxBytes)break;
  }
  if(!blob||blob.size>maxBytes){
    for(const quality of [0.75,0.65,0.55]){
      blob=await makeBlob("image/jpeg",quality);
      if(blob&&blob.size<=maxBytes)break;
    }
  }
  if(!blob||blob.size>maxBytes)throw new Error("Fotoja nuk mund të kompresohej nën 500 KB.");
  const type=blob.type||"image/webp";const ext=type==="image/jpeg"?"jpg":"webp";return new File([blob],"photo."+ext,{type,lastModified:Date.now()});
}
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
  const [photoError,setPhotoError]=useState(false),[photoPreviews,setPhotoPreviews]=useState<string[]>([]),[selectedPhotoFiles,setSelectedPhotoFiles]=useState<File[]>([]),[showDashboard,setShowDashboard]=useState(false),[showProfile,setShowProfile]=useState(false),[showNotifications,setShowNotifications]=useState(false),[publicProfileId,setPublicProfileId]=useState<string|null>(null),[notificationCount,setNotificationCount]=useState(0),[activeListing,setActiveListing]=useState<Listing|null>(null),[editingListing,setEditingListing]=useState<Listing|null>(null),[error,setError]=useState("");
  const [authMode,setAuthMode]=useState<"login"|"signup">("login"),[loading,setLoading]=useState(true),[location,setLocation]=useState("Ferizaj");
  const [coords,setCoords]=useState<{lat:number;lon:number}|null>(null),[mapMode,setMapMode]=useState(false),[nearbyOnly,setNearbyOnly]=useState(false),[favoritesOnly,setFavoritesOnly]=useState(false),[sortMode,setSortMode]=useState<"new"|"near">("new");
  const [listingCity,setListingCity]=useState(""),[showFilters,setShowFilters]=useState(false),[searchCity,setSearchCity]=useState(""),[foodFilter,setFoodFilter]=useState<"all"|"sealed"|"opened"|"refrigerated">("all");
  const [pageRoute,setPageRoute]=useState<{page:string;id?:string;conversation?:string}>({page:"home"});
  const [messageConversationId,setMessageConversationId]=useState("");
  function navigatePage(page:string,id?:string,conversation?:string){
    const params=new URLSearchParams();
    if(page!=="home")params.set("page",page);
    if(id)params.set("id",id);
    if(conversation)params.set("conversation",conversation);
    const url=params.toString()?window.location.pathname+"?"+params.toString():window.location.pathname;
    window.history.pushState({page,id,conversation}, "", url);
    setPageRoute({page,id,conversation});
  }
  function goHome(){navigatePage("home");setActiveListing(null);setPublicProfileId(null);setShowMessages(false);setShowDashboard(false);setShowProfile(false);setShowNotifications(false);setShowGive(false);setShowAuth(false);setPostChoice(false);setEditingListing(null);setPostAuth(false);setMessageConversationId("");setFavoritesOnly(false);setNearbyOnly(false);setShowFilters(false);setSearchCity("");}
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
      setProfile(p.data);setListingCity(p.data?.city||"");setLocation(p.data?.city||"Ferizaj");setFavorites((f.data||[]).map(x=>x.listing_id));setClaims((c.data||[]).map(x=>x.listing_id));
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

  useEffect(()=>{
    const p=pageRoute.page;
    if(p==="home"){
      setActiveListing(null);setPublicProfileId(null);setShowMessages(false);setShowDashboard(false);setShowProfile(false);setShowNotifications(false);setShowGive(false);setShowAuth(false);setPostChoice(false);setEditingListing(null);setPostAuth(false);setMessageConversationId("");setFavoritesOnly(false);
    }else if(p==="listing"&&pageRoute.id){
      const found=listings.find(x=>x.id===pageRoute.id);
      if(found){setActiveListing(found);setEditingListing(null);setPublicProfileId(null);setShowMessages(false);setShowDashboard(false);setShowProfile(false);setShowNotifications(false);setShowGive(false);setShowAuth(false);setPostChoice(false);setPostAuth(false);}
    }else if(p==="profile"&&pageRoute.id){
      setPublicProfileId(pageRoute.id);setActiveListing(null);setEditingListing(null);setShowMessages(false);setShowDashboard(false);setShowProfile(false);setShowNotifications(false);setShowGive(false);setShowAuth(false);setPostChoice(false);setPostAuth(false);
    }else if(p==="messages"){
      setShowMessages(true);setMessageConversationId(pageRoute.conversation||"");setActiveListing(null);setEditingListing(null);setPublicProfileId(null);setShowDashboard(false);setShowProfile(false);setShowNotifications(false);setShowGive(false);setShowAuth(false);setPostChoice(false);setPostAuth(false);
    }else if(p==="dashboard"){
      setShowDashboard(true);setActiveListing(null);setEditingListing(null);setPublicProfileId(null);setShowMessages(false);setShowProfile(false);setShowNotifications(false);setShowGive(false);setShowAuth(false);setPostChoice(false);setPostAuth(false);
    }else if(p==="notifications"){
      setShowNotifications(true);setActiveListing(null);setEditingListing(null);setPublicProfileId(null);setShowMessages(false);setShowDashboard(false);setShowProfile(false);
    }else if(p==="saved"){
      setFavoritesOnly(true);setActiveListing(null);setShowGive(false);setShowAuth(false);setPostChoice(false);setPostAuth(false);setPublicProfileId(null);setShowMessages(false);setShowDashboard(false);setShowProfile(false);setShowNotifications(false);setShowGive(false);setShowAuth(false);setPostChoice(false);setEditingListing(null);
    }else if(p==="me"){
      setShowProfile(true);setActiveListing(null);setEditingListing(null);setPublicProfileId(null);setShowMessages(false);setShowDashboard(false);setShowNotifications(false);setShowGive(false);setShowAuth(false);setPostChoice(false);setPostAuth(false);
    }else if(p==="post"){
      if(user){setShowGive(true);setPostChoice(false);setShowAuth(false);}else{setShowGive(false);setPostChoice(true);setShowAuth(false);}
      setFavoritesOnly(false);setActiveListing(null);setEditingListing(null);setPublicProfileId(null);setShowMessages(false);setShowDashboard(false);setShowProfile(false);setShowNotifications(false);
    }else if(p==="post-choice"){
      setPostChoice(true);setShowGive(false);setShowAuth(false);setFavoritesOnly(false);
    }else if(p==="auth"){
      const authKind=pageRoute.conversation||"login";
      setShowAuth(true);setAuthMode(authKind.endsWith("signup")?"signup":"login");setPostAuth(authKind.startsWith("post-"));setPostChoice(false);setShowGive(false);setShowMessages(false);setShowDashboard(false);setShowProfile(false);setShowNotifications(false);
    }else if(p==="edit"&&pageRoute.id){
      const found=listings.find(x=>x.id===pageRoute.id);
      if(found){setEditingListing(found);setActiveListing(null);setPublicProfileId(null);setShowMessages(false);setShowDashboard(false);setShowProfile(false);setShowNotifications(false);setShowGive(false);setShowAuth(false);setPostChoice(false);setPostAuth(false);}
    }
  },[pageRoute,listings,user]);

  const filtered=useMemo(()=>{
    let a=listings.filter(x=>
      (category==="Të gjitha"||x.category===categoryDb[category])&&
      (x.title+" "+(x.description||"")).toLowerCase().includes(query.toLowerCase())&&
      (!favoritesOnly||favorites.includes(x.id))&&
      (!searchCity||x.location_name===searchCity)
      );
    if(nearbyOnly&&coords)a=a.filter(x=>{const d=distanceKm(coords.lat,coords.lon,x.latitude,x.longitude);return d!=null&&d<=25;});
    if(sortMode==="near"&&coords)a=[...a].sort((x,y)=>(distanceKm(coords.lat,coords.lon,x.latitude,x.longitude)??9999)-(distanceKm(coords.lat,coords.lon,y.latitude,y.longitude)??9999));
    return a;
  },[listings,category,query,coords,nearbyOnly,favoritesOnly,favorites,sortMode,searchCity]);

  async function requireAuthenticatedUser(){
    const {data,error:e}=await supabase.auth.getUser();
    if(e||!data.user){setShowAuth(true);setAuthMode("login");setPostAuth(false);navigatePage("auth");return null;}
    if(!user||user.id!==data.user.id)setUser(data.user);
    return data.user;
  }
  function requireAuth(){if(!user){setShowAuth(true);setAuthMode("login");setPostAuth(false);navigatePage("auth");return false;}return true;}
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
        const created=await finishListing(result.data.user,pendingPost);
        setPosting(false);
        setPendingPost(null);
        if(created){setShowAuth(false);setShowGive(false);setPostAuth(false);await load();navigatePage("listing",created.id);return;}
      }
    }
    setShowAuth(false);
    if(postAuth){setPostAuth(false);setPostChoice(false);setShowGive(true);navigatePage("post");}
    await load();
  }
  async function signOut(){await supabase.auth.signOut();setShowMenu(false);setShowProfile(false);setShowNotifications(false);await load();}
  async function loadNotificationCount(){
    if(!user){setNotificationCount(0);return;}
    const {count}=await supabase.from("dhuroje_notifications").select("id",{count:"exact",head:true}).eq("recipient_id",user.id).is("read_at",null);
    setNotificationCount(count||0);
  }
  useEffect(()=>{loadNotificationCount();},[user]);
  async function openNotifications(){if(!user){setShowAuth(true);return;}setShowNotifications(true);navigatePage("notifications");}
  async function openProfile(){if(!user){setShowAuth(true);return;}setShowProfile(true);navigatePage("me");}
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
  async function finishListing(postingUser:any,f:FormData,filesOverride?:File[]){
    const description=String(f.get("description")||"").trim();
    if(!description){setError("Ju lutem plotësoni përshkrimin.");return null;}
    const files=filesOverride?.length?filesOverride:Array.from(f.getAll("photos")).filter((x):x is File=>x instanceof File&&x.size>0);
    if(!files.length){setPhotoError(true);setError("Ju lutem plotësoni këtë fushë duke shtuar të paktën 1 foto.");return null;}
    // Never create the listing until at least one selected photo is actually ready.
    if(files.length!==photoPreviews.length || photoPreviews.length<1){setPhotoError(true);setError("Prit derisa fotoja të shfaqet në miniaturë para publikimit.");return null;}
    const {data:item,error:e1}=await supabase.from("dhuroje_listings").insert({
      owner_id:postingUser.id,title:String(f.get("title")),description:String(f.get("description")||""),
      category:categoryDb[String(f.get("category"))]||"other",status:"available",location_name:String(f.get("city")||listingCity||profile?.city||location),
      latitude:coords?.lat??null,longitude:coords?.lon??null,
      food_refrigerated:categoryDb[String(f.get("category"))]==="food"&&f.get("food_refrigerated")==="on",food_opened:categoryDb[String(f.get("category"))]==="food"&&f.get("food_opened")==="on"
    }).select("*").single();
    if(e1||!item){setError(e1?.message||"Nuk u krijua shpallja.");return null;}
    const photoCount=Math.min(files.length,6);
    // Upload the first photo separately and verify it is saved before continuing.
    // This prevents the common case where photos 2+ exist but the primary photo is missing.
    const first=files[0];
    const firstExt=first.name.split(".").pop()?.toLowerCase()||"jpg";
    const firstPath=postingUser.id+"/"+item.id+"/0-"+crypto.randomUUID()+"."+firstExt;
    const firstUpload=await supabase.storage.from("dhuroje-listings").upload(firstPath,first,{contentType:first.type||"image/jpeg",upsert:false});
    if(firstUpload.error){
      setPhotoError(true);
      setError("Fotoja e parë nuk u ngarkua. Prit derisa fotoja të jetë gati dhe provo përsëri.");
      await supabase.rpc("dhuroje_delete_listing",{p_listing_id:item.id});
      return null;
    }
    const {error:firstImageError}=await supabase.from("dhuroje_listing_images").insert({listing_id:item.id,storage_path:firstPath,sort_order:0});
    if(firstImageError){
      await supabase.storage.from("dhuroje-listings").remove([firstPath]);
      setPhotoError(true);
      setError("Fotoja e parë nuk u ruajt. Prit derisa fotoja të jetë gati dhe provo përsëri.");
      await supabase.rpc("dhuroje_delete_listing",{p_listing_id:item.id});
      return null;
    }

    // Confirm the primary image row exists before uploading the remaining photos.
    const {data:firstSaved}=await supabase.from("dhuroje_listing_images").select("id,storage_path").eq("listing_id",item.id).eq("sort_order",0).maybeSingle();
    if(!firstSaved){
      setPhotoError(true);
      setError("Fotoja e parë nuk është ende gati. Provo përsëri pasi të shfaqet në miniaturë.");
      await supabase.rpc("dhuroje_delete_listing",{p_listing_id:item.id});
      return null;
    }

    for(let i=1;i<photoCount;i++){
      const file=files[i],ext=file.name.split(".").pop()?.toLowerCase()||"jpg",path=postingUser.id+"/"+item.id+"/"+i+"-"+crypto.randomUUID()+"."+ext;
      const up=await supabase.storage.from("dhuroje-listings").upload(path,file,{contentType:file.type||"image/jpeg",upsert:false});
      if(up.error){setError("Një foto nuk u ngarkua. Ju lutem provoje përsëri.");await supabase.rpc("dhuroje_delete_listing",{p_listing_id:item.id});return null;}
      const {error:imageError}=await supabase.from("dhuroje_listing_images").insert({listing_id:item.id,storage_path:path,sort_order:i});
      if(imageError){await supabase.storage.from("dhuroje-listings").remove([path]);setError("Një foto nuk u ruajt. Ju lutem provoje përsëri.");await supabase.rpc("dhuroje_delete_listing",{p_listing_id:item.id});return null;}
    }
    return item as Listing;
  }
  async function createListing(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError("");
    const f=new FormData(e.currentTarget);
    const description=String(f.get("description")||"").trim();
    if(!description){setError("Ju lutem plotësoni përshkrimin.");return;}
    const selectedPhotos=selectedPhotoFiles.length?selectedPhotoFiles:Array.from(f.getAll("photos")).filter((x):x is File=>x instanceof File&&x.size>0);
    if(!selectedPhotos.length || selectedPhotos.length!==photoPreviews.length){setPhotoError(true);setError("Prit derisa fotoja të shfaqet në miniaturë para publikimit.");return;}
    setPosting(true);
    if(!user){setError("Hyr ose krijo një llogari para se të publikosh.");setPosting(false);return;}
    const created=await finishListing(user,f,selectedPhotos);
    setPosting(false);
    if(created){
      setShowGive(false);
      setPhotoError(false);
      setSelectedPhotoFiles([]);
      await load();
      navigatePage("listing",created.id);
    }
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
    navigatePage("edit",listing.id);
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
      otherUserId=listing.owner_id;
    } else if(!otherUserId){
      setError("Për të kontaktuar një kërkues, hape kërkesën te Paneli im dhe zgjidh Mesazho.");
      setShowMessages(true);
      navigatePage("messages");
      return;
    }

    if(!otherUserId||otherUserId===currentUser.id){
      setError("Nuk mund të hapësh bisedë me veten.");
      setShowMessages(true);
      navigatePage("messages");
      return;
    }

    setError("");
    const {data:conversationId,error:e}=await supabase.rpc("dhuroje_get_or_create_conversation",{
      p_listing_id:listing.id,
      p_other_user_id:otherUserId
    });

    if(e||!conversationId){
      setShowMessages(true);
      setMessageConversationId("");
      navigatePage("messages");
      setError(e?.message||"Biseda nuk u krijua. Provo përsëri.");
      return;
    }

    // The URL is the source of truth for the conversation opened from a listing.
    // Close the listing overlay before opening the inbox so two pages cannot stack.
    setActiveListing(null);
    setEditingListing(null);
    setPublicProfileId(null);
    setShowDashboard(false);
    setShowProfile(false);
    setShowNotifications(false);
    setShowGive(false);
    setShowAuth(false);
    setPostChoice(false);
    setPostAuth(false);
    setMessageConversationId(conversationId);
    setShowMessages(true);
    navigatePage("messages",undefined,conversationId);
  }
  function openPosting(){
    setError("");
    setPhotoError(false);
    setPhotoPreviews([]);
    setSelectedPhotoFiles([]);
    setPostingCategory("Ushqim");
    if(user){setPostChoice(false);setShowGive(true);navigatePage("post");return;}
    setPostChoice(true);setShowGive(false);navigatePage("post-choice");
  }
  function choosePostAuth(mode:"login"|"signup"){
    setAuthMode(mode);setPostAuth(true);setPostChoice(false);setShowAuth(true);
    const authKind="post-"+mode;
    const params=new URLSearchParams({page:"auth",mode:authKind});
    window.history.pushState({page:"auth",mode:authKind},"",window.location.pathname+"?"+params.toString());
    setPageRoute({page:"auth",conversation:authKind});
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
    <header className="topbar"><div className="brand"><span className="brand-mark">D</span><span>Dhuroje</span></div><div className="header-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Kërko në Dhuroje..." aria-label="Kërko"/><button type="button" className="search-filter-trigger" onClick={()=>setShowFilters(x=>!x)} aria-label="Filtrat">⚙️</button></div><nav className="top-nav"><button className="top-nav-active" onClick={()=>{setFavoritesOnly(false);setMapMode(false);goHome()}}><span aria-hidden="true">🔎</span> Eksploro</button><button onClick={()=>{if(user){setFavoritesOnly(true);setMapMode(false);navigatePage("saved")}else{setShowAuth(true);setAuthMode("login");navigatePage("auth")}}}><span aria-hidden="true">♡</span> Të ruajturat</button></nav><div className="top-actions">
      <button className="header-link" onClick={()=>openPosting()}><span aria-hidden="true">🎁</span> Dhuro</button>{user&&<button className="notification-button" aria-label="Njoftimet" onClick={openNotifications}>🔔{notificationCount>0&&<span>{notificationCount>99?"99+":notificationCount}</span>}</button>}<button className="profile-button" aria-label="Profili" onClick={()=>user?openProfile():setShowMenu(!showMenu)}>●</button>
      {showMenu&&<div className="profile-menu">{user?<><strong>{profile?.display_name||user.email}</strong><button onClick={()=>{setShowMessages(true);navigatePage("messages")}}>💬 Mesazhet</button><button onClick={()=>{if(requireAuth()){setShowDashboard(true);navigatePage("dashboard")}}}>📦 Paneli im</button><button onClick={signOut}>Dil</button></>:<button onClick={()=>{setShowAuth(true);setAuthMode("login");setPostAuth(false);navigatePage("auth")}}>Hyr / Regjistrohu</button>}</div>}
    </div></header>

    <section className="hero"><div><p className="eyebrow">♻️ TREGU FALAS I KOMUNITETIT</p><h1>Gjej. Merr.<br/><span>Dhuro.</span></h1><p className="hero-copy">Gjërat që nuk të duhen më mund t'i gjejnë një shtëpi të re — falas, pranë teje.</p></div><div className="hero-actions"><button className="primary" onClick={()=>openPosting()}>＋ Dhuro një gjë</button>{user&&<button className="secondary" onClick={()=>{setShowDashboard(true);navigatePage("dashboard")}}>Paneli im</button>}</div></section>
    <section className="search-wrap mobile-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Çfarë po kërkon? p.sh. karrige, rroba..."/><button type="button" className="search-filter-trigger" onClick={()=>setShowFilters(x=>!x)} aria-label="Filtrat">⚙️</button></section>
    <section className="categories">{categories.map(x=><button key={x} className={category===x?"chip active":"chip"} onClick={()=>setCategory(x)}><span className="chip-icon">{x==="Të gjitha"?"✨":x==="Ushqim"?"🥖":x==="Veshmbathje"?"👕":x==="Shtëpi"?"🪑":x==="Elektronikë"?"📱":x==="Fëmijë"?"🧸":x==="Libra"?"📚":"🎁"}</span><span>{x}</span></button>)}</section>
    <div className="market-filter-bar"><button className="filter-button" onClick={()=>setShowFilters(x=>!x)}>⚙️ Filtrat{(searchCity||sortMode!=="new")&&<span className="filter-count">●</span>}</button><button className="filter-button" onClick={()=>{setSearchCity("");setSortMode("new");setNearbyOnly(false);}}>Pastro</button></div>
    {showFilters&&<section className="search-filters"><label>Qyteti<select value={searchCity} onChange={e=>setSearchCity(e.target.value)}><option value="">Të gjitha qytetet</option>{cities.map(c=><option key={c} value={c}>{c}</option>)}</select></label><label>Rendit<select value={sortMode} onChange={e=>setSortMode(e.target.value as "new"|"near")}><option value="new">Më të rejat</option><option value="near" disabled={!coords}>Më të afërtat</option></select></label></section>}
    <section className="location-row"><div><span className="pin">⌖</span><div><strong>{location}</strong><small>{nearbyOnly?"Brenda 25 km":"Shih çfarë po dhurohet pranë teje"}</small></div></div><div className="location-actions"><button className="filter-button" onClick={locate}>📍 Përdor lokacionin</button><button className="map-toggle" onClick={toggleMap}>🗺️ {mapMode?"Lista":"Harta"}</button></div></section>
    {coords&&<div className="filter-panel"><button onClick={()=>setNearbyOnly(x=>!x)}>{nearbyOnly?"✓ Brenda 25 km":"Pranë meje · 25 km"}</button><span className="nearby-hint">Renditur sipas distancës</span></div>}
    {mapMode&&coords&&<section className="map-panel"><iframe title="Harta e Dhuroje" src={"https://www.openstreetmap.org/export/embed.html?bbox="+(coords.lon-.12)+"%2C"+(coords.lat-.08)+"%2C"+(coords.lon+.12)+"%2C"+(coords.lat+.08)+"&layer=mapnik&marker="+coords.lat+"%2C"+coords.lon}/><div className="map-list">{filtered.slice(0,8).map(x=><button key={x.id} onClick={()=>{setActiveListing(x);navigatePage("listing",x.id)}}>{emoji(x.category)} <span><b>{x.title}</b><small>{x.location_name||"Pranë teje"}{distanceKm(coords.lat,coords.lon,x.latitude,x.longitude)!=null?" · "+distanceKm(coords.lat,coords.lon,x.latitude,x.longitude)!.toFixed(1)+" km":""}</small></span></button>)}</div></section>}

    <section className="section-head"><div><p className="eyebrow">{nearbyOnly?"PRANË MEJE":"DHURATA TË REJA"}</p><h2>{filtered.length} dhurata falas</h2></div><select className="sort-select" value={sortMode} onChange={e=>setSortMode(e.target.value as "new"|"near")}><option value="new">Më të rejat</option><option value="near" disabled={!coords}>Më të afërtat</option></select></section>
    {error&&<div className="error">{error}<button onClick={()=>setError("")}>×</button></div>}
    {!mapMode&&<section className="listing-grid">{filtered.map(item=><article className="card" key={item.id} onClick={()=>{setActiveListing(item);navigatePage("listing",item.id)}}>
      <div className="card-image">{images[item.id]?.[0]?<img src={images[item.id][0]} alt="" />:<span>{emoji(item.category)}</span>}<b>FALAS</b><button className="heart" onClick={e=>{e.stopPropagation();toggleFavorite(item.id)}}>{favorites.includes(item.id)?"♥":"♡"}</button></div>
      <div className="card-body"><div className="meta"><span>{categoryLabel[item.category]||item.category}</span><span>📍 {item.location_name||"Pranë teje"}</span></div><button className="poster-line poster-button" onClick={e=>{e.stopPropagation();setPublicProfileId(item.owner_id);navigatePage("profile",item.owner_id)}}>👤 <strong>{item.owner?.display_name||"Përdorues i regjistruar"}</strong> · Shiko profilin</button><h3>{item.title}</h3><p>{item.description||"Pa përshkrim."}</p>
      <div className="card-footer"><small><button className="poster-name-link" onClick={e=>{e.stopPropagation();setPublicProfileId(item.owner_id);navigatePage("profile",item.owner_id)}}>{item.owner?.display_name||"Përdorues i regjistruar"}</button> · {coords&&distanceKm(coords.lat,coords.lon,item.latitude,item.longitude)!=null?distanceKm(coords.lat,coords.lon,item.latitude,item.longitude)!.toFixed(1)+" km · ":""}Postuar</small>{user?.id!==item.owner_id&&<button className={claims.includes(item.id)?"claimed":"claim"} onClick={e=>{e.stopPropagation();claim(item.id)}}>{claims.includes(item.id)?"Kërkuar ✓":"Kërko"}</button>}</div></div>
    </article>)}</section>}
    {!loading&&filtered.length===0&&<div className="empty">Nuk ka ende dhurata që përputhen me kërkimin.</div>}

    {showGive&&<div className="route-shell"><div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&goHome()}><form className="modal" onSubmit={createListing}><div className="modal-head"><div><p className="eyebrow">DHUROJE</p><h2>Posto diçka falas</h2></div><button type="button" className="close" onClick={goHome}>×</button></div><label>Çfarë po dhuron?<input name="title" required placeholder={postingCategory==="Ushqim"?"p.sh. 5 pako bukë":"p.sh. karrige, rroba, libra..."}/></label><label>Kategoria<select name="category" value={postingCategory} onChange={e=>setPostingCategory(e.target.value)}>{categories.slice(1).map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Qyteti<select name="city" value={listingCity} onChange={e=>setListingCity(e.target.value)} required>{profile?.city&&!cities.includes(profile.city)&&<option value={profile.city}>{profile.city}</option>}{cities.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
      <div className={"photo-picker"+(photoError?" photo-picker-invalid":"")}><span className="photo-label">Fotot <b className="required-mark">*</b></span><label className="photo-button">➕ Shto foto<input name="photos" type="file" accept="image/*" multiple onChange={async e=>{const files=Array.from(e.target.files||[]).filter(f=>f.size>0).slice(0,6-selectedPhotoFiles.length);if(files.length){try{setPhotoError(false);setError("");const compressed:File[]=[];for(const file of files){const result=await compressImage(file,1200,500*1024);if(result)compressed.push(result);}const next=[...selectedPhotoFiles,...compressed].slice(0,6);setSelectedPhotoFiles(next);setPhotoPreviews(next.map(f=>URL.createObjectURL(f)));if(!compressed.length)throw new Error("Nuk u zgjodh asnjë foto e vlefshme.");}catch(err:any){setPhotoError(true);setError(err?.message||"Fotoja nuk mund të kompresohej.");}finally{e.currentTarget.value="";}}}}/></label>{photoPreviews.length>0&&<div className="photo-thumbnails" aria-label="Fotot e zgjedhura">{photoPreviews.map((src,i)=><div className="photo-thumbnail" key={src}><img src={src} alt={"Foto "+(i+1)}/><button type="button" className="photo-remove" aria-label={"Hiq foton "+(i+1)} onClick={()=>{const next=selectedPhotoFiles.filter((_,index)=>index!==i);setSelectedPhotoFiles(next);setPhotoPreviews(next.map(f=>URL.createObjectURL(f)));if(!next.length)setPhotoError(false);}}>×</button><span>{i+1}</span></div>)}</div>}{photoError&&<small className="photo-validation-error">Ju lutem plotësoni këtë fushë duke shtuar të paktën 1 foto.</small>}<small className="form-help">Minimum 1, maksimum 6 foto. Kompresohen automatikisht në WebP, deri në 500 KB secila.</small></div>
      <label>Përshkrimi <b className="required-mark">*</b><textarea name="description" required placeholder={postingCategory==="Ushqim"?"Çfarë ushqimi është, sasia dhe kushtet e marrjes...":"Gjendja, madhësia, marka, sasia dhe kushtet e marrjes..."}/></label>
      {postingCategory==="Ushqim"&&<div className="food-fields"><p className="form-section-title">🍎 Informacion për ushqimin</p><div className="check-row"><label><input name="food_refrigerated" type="checkbox"/> Kërkon frigorifer</label><label><input name="food_opened" type="checkbox"/> E hapur</label></div></div>}
<button className="primary full" type="submit" disabled={posting||selectedPhotoFiles.length<1||selectedPhotoFiles.length!==photoPreviews.length}>{posting?"Po publikohet…":selectedPhotoFiles.length<1?"Shto të paktën 1 foto":user?"Publiko falas":"Krijo llogari & publiko"}</button>
    </form></div></div>}

    {activeListing&&<div className="page-screen"><ListingDetail listing={activeListing} image={images[activeListing.id]?.[0]} saved={favorites.includes(activeListing.id)} claimed={claims.includes(activeListing.id)} isOwner={user?.id===activeListing.owner_id} onClose={goHome} onClaim={()=>claim(activeListing.id)} onSave={()=>toggleFavorite(activeListing.id)} onChat={()=>startChat(activeListing)} onEdit={()=>quickEditListing(activeListing)} onMarkGiven={()=>markAsGiven(activeListing)} onDelete={()=>deleteListing(activeListing)} onProfile={()=>{setPublicProfileId(activeListing.owner_id);navigatePage("profile",activeListing.owner_id)}}/></div>}
    {editingListing&&<div className="page-screen"><EditListingModal listing={editingListing} onClose={()=>{setEditingListing(null);if(activeListing)navigatePage("listing",activeListing.id);else goHome();}} onSaved={async()=>{setEditingListing(null);if(activeListing)navigatePage("listing",activeListing.id);else goHome();await load();}}/></div>}
    {postChoice&&<div className="page-screen"><div className="page-content"><div className="modal auth-choice"><div className="modal-head"><div><p className="eyebrow">DHUROJE</p><h2>Si dëshiron të vazhdosh?</h2></div><button type="button" className="close" onClick={()=>setPostChoice(false)}>×</button></div><p className="form-help">Për të dhuruar një gjë, zgjidh nëse ke llogari apo po poston për herë të parë.</p><button className="primary full" onClick={()=>choosePostAuth("login")}>Kam llogari · Hyr</button><button className="secondary full" onClick={()=>choosePostAuth("signup")}>Jam i ri · Krijo llogari</button></div></div></div>}
    {showAuth&&<div className="page-screen"><div className="page-content"><form className="modal" onSubmit={auth}><div className="modal-head"><div><p className="eyebrow">DHUROJE</p><h2>{postAuth?(authMode==="login"?"Hyr për të dhuruar":"Krijo llogari për të dhuruar"):(pendingPost?"Krijo llogari":"Krijo llogari")}</h2></div><button type="button" className="close" onClick={goHome}>×</button></div>{postAuth&&<p className="form-help">{authMode==="login"?"Hyr me llogarinë tënde dhe pastaj plotëso postimin.":"Krijo llogarinë tënde një herë dhe pastaj plotëso postimin."}</p>}{pendingPost&&<p className="form-help">Postimi yt është ruajtur. Krijo llogarinë dhe do të publikohet menjëherë.</p>}{authMode==="signup"&&<label>Emri<input name="name" required placeholder="Emri yt"/></label>}<label>Email<input name="email" type="email" required/></label><label>Fjalëkalimi<input name="password" type="password" minLength={6} required/></label><button className="primary full" disabled={posting}>{pendingPost?"Krijo llogari & publiko":authMode==="login"?"Hyr":"Krijo llogari"}</button>{!pendingPost&&!postAuth&&<button type="button" className="secondary full" onClick={()=>{const next=authMode==="login"?"signup":"login";setAuthMode(next);const mode=postAuth?"post-"+next:next;navigatePage("auth",undefined,mode)}}>{authMode==="login"?"Krijo llogari":"Kam llogari"}</button>}{postAuth&&<button type="button" className="secondary full" onClick={()=>setAuthMode(authMode==="login"?"signup":"login")}>{authMode==="login"?"Jam i ri · Krijo llogari":"Kam llogari · Hyr"}</button>}</form></div></div>}
    {pageRoute.page==="saved"&&user&&<div className="page-screen"><SavedListings userId={user.id} favorites={favorites} onRemove={(id)=>toggleFavorite(id)} onListing={(listing)=>{setActiveListing(listing);navigatePage("listing",listing.id);}} onExplore={goHome}/></div>}\n    {showMessages&&<div className="page-screen"><Messages user={user} initialConversationId={messageConversationId} initialError={error} onClose={goHome} onListing={(listing)=>{setActiveListing(listing);navigatePage("listing",listing.id);}}/></div>}
    {showNotifications&&<div className="page-screen"><Notifications user={user} onClose={goHome} onChanged={loadNotificationCount}/></div>}
    {showProfile&&<div className="page-screen"><ProfileModal user={user} onClose={goHome} onChanged={loadNotificationCount}/></div>}
    {publicProfileId&&<div className="page-screen"><PublicProfileModal userId={publicProfileId} onClose={goHome} onListing={(listing,image)=>{setActiveListing(listing);if(image)setImages(prev=>({...prev,[listing.id]:[image,...(prev[listing.id]||[])]}));navigatePage("listing",listing.id);}}/></div>}
    {showDashboard&&<div className="page-screen"><Dashboard user={user} profile={profile} onClose={goHome} onChanged={load} onChat={(listing,claimantId)=>startChat(listing,claimantId)} onEdit={quickEditListing} onMarkGiven={markAsGiven} onProfile={openProfile} onMessages={()=>{setShowMessages(true);navigatePage("messages")}} onListing={(listing)=>{setActiveListing(listing);navigatePage("listing",listing.id)}} onSaved={()=>{setFavoritesOnly(true);navigatePage("saved")}} onRequested={()=>navigatePage("dashboard")}/></div>}
    <nav className="bottom-nav" aria-label="Navigimi kryesor"><button className="nav-active" onClick={()=>{setMapMode(false);setShowDashboard(false);goHome()}}><span className="nav-icon" aria-hidden="true">🏠</span><span>Eksploro</span></button><button className={favoritesOnly?"nav-active":""} onClick={()=>{if(requireAuth()){setFavoritesOnly(true);setMapMode(false);navigatePage("saved");}}}><span className="nav-icon" aria-hidden="true">♡</span><span>Ruajturat</span></button><button onClick={()=>openPosting()} className="nav-add" aria-label="Dhuro një gjë"><span aria-hidden="true">＋</span></button><button onClick={()=>{if(requireAuth()){setShowMessages(true);navigatePage("messages");}}}><span className="nav-icon" aria-hidden="true">💬</span><span>Mesazhet</span></button><button onClick={()=>setShowMenu(!showMenu)}><span className="nav-icon" aria-hidden="true">👤</span><span>Profili</span></button></nav>
  </main>;
}

function SavedListings({userId,favorites,onRemove,onListing,onExplore}:{userId:string;favorites:string[];onRemove:(id:string)=>void;onListing:(listing:Listing)=>void;onExplore:()=>void}){
  const [rows,setRows]=useState<Listing[]>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      setLoading(true);
      if(!favorites.length){if(!cancelled)setRows([]);setLoading(false);return;}
      const {data,error:e}=await supabase.from("dhuroje_listings").select("*, owner:dhuroje_profiles!dhuroje_listings_owner_id_fkey(id,display_name,avatar_url)").in("id",favorites).eq("status","available");
      if(!cancelled)setRows(e?[]:(data||[]) as Listing[]);
      setLoading(false);
    })();
    return()=>{cancelled=true};
  },[favorites]);
  return <div className="page-content saved-page">
    <div className="account-page-top"><div><p className="eyebrow">TË RUAJTURAT</p><h1>Ruajturat</h1><p className="account-email">Dhuratat që ke ruajtur për t'i parë më vonë.</p></div><button className="close account-close" onClick={onExplore} aria-label="Mbyll">×</button></div>
    {loading?<div className="empty">Po ngarkohen të ruajturat…</div>:!rows.length?
      <div className="saved-empty"><div className="messages-empty-icon">♡</div><h2>Nuk ke ruajtur ende asnjë dhuratë</h2><p>Eksploro dhuratat falas dhe ruaj ato që të pëlqejnë.</p><button className="primary" onClick={onExplore}>Eksploro</button></div>:
      <section className="listing-grid">{rows.map(x=><article className="card" key={x.id} onClick={()=>onListing(x)}>
        <div className="card-image"><span>{emoji(x.category)}</span><b>FALAS</b><button className="heart" onClick={e=>{e.stopPropagation();onRemove(x.id)}}>♥</button></div>
        <div className="card-body"><div className="meta"><span>{categoryLabel[x.category]||x.category}</span><span>📍 {x.location_name||"Pranë teje"}</span></div><h3>{x.title}</h3><p>{x.description||"Pa përshkrim."}</p><div className="card-footer"><small>{x.owner?.display_name||"Përdorues"}</small><button className="claim" onClick={e=>{e.stopPropagation();onListing(x)}}>Shiko</button></div></div>
      </article>)}</section>}
  </div>;
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
    <div className="modal-head"><div><p className="eyebrow">DHURUESI</p><h2>{profile?.display_name||"Përdorues i regjistruar"}</h2><div className="profile-meta">{profile?.city&&<span>📍 {profile.city}</span>}{profile?.age!=null&&<span>🎂 {profile.age} vjeç</span>}{profile?.created_at&&<span>Anëtar që nga {new Date(profile.created_at).toLocaleDateString("sq-AL")}</span>}</div></div><button className="close" onClick={onClose}>×</button></div>
    <div className="profile-stats"><div><b>{posts.length}</b><small>shpallje aktive</small></div><div><b>{reviews.length}</b><small>vlerësime</small></div><div><b>{avg?avg.toFixed(1):"—"}</b><small>⭐ mesatare</small></div></div>
    {onChat&&<button className="secondary full" onClick={onChat}>💬 Mesazho</button>}
    <div className="profile-posts"><h3>Shpalljet e këtij dhuruesi</h3>{posts.length?<div className="public-profile-posts">{posts.map(x=><button className="public-profile-post" key={x.id} onClick={()=>onListing?.(x,postImages[x.id])}><span className="public-profile-post-image">{postImages[x.id]?<img src={postImages[x.id]} alt=""/>:<span>{emoji(x.category)}</span>}</span><span><b>{x.title}</b><small>{categoryLabel[x.category]||x.category} · {x.location_name||"Pranë teje"}</small><small>{x.status==="reserved"?"E rezervuar":"E disponueshme"}</small></span></button>)}</div>:<div className="empty">Ky dhurues nuk ka shpallje aktive.</div>}</div>
    <div className="profile-reviews"><h3>Vlerësimet</h3>{reviews.length?reviews.map(r=><div className="review-row" key={r.id}><div><b>{r.reviewer?.display_name||"Përdorues"}</b><span>{"★".repeat(r.rating)}{"☆".repeat(5-r.rating)}</span></div><p>{r.comment||"Pa koment."}</p></div>):<div className="empty">Nuk ka ende vlerësime.</div>}</div>
  </div></div>;
}

function ListingDetail({listing,image,saved,claimed,isOwner,onClose,onClaim,onSave,onChat,onEdit,onMarkGiven,onDelete,onProfile}:{listing:Listing;image?:string;saved:boolean;claimed:boolean;isOwner:boolean;onClose:()=>void;onClaim:()=>void;onSave:()=>void;onChat:()=>void;onEdit:()=>void;onMarkGiven:()=>void;onDelete:()=>void;onProfile:()=>void}){
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal"><div className="modal-head"><div><p className="eyebrow">{categoryLabel[listing.category]||listing.category}</p><h2>{listing.title}</h2></div><button className="close" onClick={onClose}>×</button></div>{image?<img className="detail-image" src={image} alt=""/>:<div className="detail-emoji">{emoji(listing.category)}</div>}<p>{listing.description||"Pa përshkrim."}</p><button className="poster-line poster-button" onClick={onProfile}>👤 <strong>{listing.owner?.display_name||"Përdorues i regjistruar"}</strong> · Dhurues</button><p>📍 {listing.location_name||"Pranë teje"}</p><p>🕒 Postuar më {new Date(listing.created_at).toLocaleDateString("sq-AL")}</p>{listing.food_refrigerated&&<p>❄️ Kërkon frigorifer</p>}{listing.food_opened&&<p>📦 E hapur</p>}<div className="detail-actions">{isOwner?<><button className="primary" onClick={onEdit}>✏️ Ndrysho shpalljen</button><button className="secondary" onClick={onMarkGiven}>✓ Shëno si të dhuruar</button><button className="secondary danger" onClick={onDelete}>🗑️ Fshi shpalljen</button></>:<><button className="primary" onClick={onClaim}>{claimed?"Hiq kërkesën":"Kërko këtë dhuratë"}</button><button className="secondary" onClick={onChat}>💬 Mesazho dhuruesin</button></>}<button className="secondary" onClick={onSave}>{saved?"♥ Ruajtur":"♡ Ruaje"}</button></div></div></div>;
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
    const description=String(f.get("description")||"").trim();
    if(!description){setError("Ju lutem plotësoni përshkrimin.");setSaving(false);return;}
    const categoryValue=String(f.get("category"));
    const isFood=categoryValue==="food";
    const {error:e1}=await supabase.from("dhuroje_listings").update({
      title:String(f.get("title")||"").trim(),
      description:String(f.get("description")||"").trim(),
      category:categoryValue,
      location_name:String(f.get("location_name")||"").trim()||null,
      latitude:lat,longitude:lon,
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
    <label>Përshkrimi <b className="required-mark">*</b><textarea name="description" defaultValue={listing.description||""} required /></label>
    <label>Qyteti<select name="location_name" value={locationName} onChange={e=>setLocationName(e.target.value)} required><option value="">Zgjidh qytetin</option>{cities.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
    <button type="button" className="secondary full" onClick={captureLocation}>📍 Përdor lokacionin tim</button>
    {category==="food"&&<div className="food-fields"><p className="form-section-title">🍎 Informacion për ushqimin</p><div className="check-row"><label><input name="food_refrigerated" type="checkbox" defaultChecked={!!listing.food_refrigerated}/> Kërkon frigorifer</label><label><input name="food_opened" type="checkbox" defaultChecked={!!listing.food_opened}/> E hapur</label></div></div>}
    <div className="photo-picker"><span className="photo-label">Fotot</span>{photos.length>0&&<div className="edit-photo-grid">{photos.map(p=><div className={removePhotoIds.includes(p.id)?"edit-photo removed":"edit-photo"} key={p.id}><img src={p.url} alt="" /><button type="button" onClick={()=>setRemovePhotoIds(x=>x.includes(p.id)?x.filter(id=>id!==p.id):[...x,p.id])}>{removePhotoIds.includes(p.id)?"↩":"×"}</button></div>)}</div>}<label className="photo-button">📷 Shto foto të reja<input type="file" accept="image/*" multiple onChange={async e=>{try{const files=Array.from(e.target.files||[]).filter(f=>f.size>0).slice(0,6);const compressed:File[]=[];for(const file of files){const result=await compressImage(file,1200,500*1024);if(result)compressed.push(result);}setNewFiles(compressed);if(files.length&&!compressed.length)setError("Nuk u zgjodh asnjë foto e vlefshme.");}catch(err:any){setError(err?.message||"Fotoja nuk mund të kompresohej.");}finally{e.currentTarget.value="";}}}/></label></div>
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
  const [profile,setProfile]=useState<any>(null),[reviews,setReviews]=useState<any[]>([]),[stats,setStats]=useState({active:0,given:0}),[name,setName]=useState(""),[city,setCity]=useState(""),[age,setAge]=useState(""),[phone,setPhone]=useState(""),[avatarFile,setAvatarFile]=useState<File|null>(null),[avatarPreview,setAvatarPreview]=useState(""),[saving,setSaving]=useState(false);
  async function load(){
    const [p,r,l]=await Promise.all([
      supabase.from("dhuroje_profiles").select("*").eq("id",user.id).maybeSingle(),
      supabase.from("dhuroje_reviews").select("*").eq("reviewed_id",user.id).order("created_at",{ascending:false}),
      supabase.from("dhuroje_listings").select("status").eq("owner_id",user.id)
    ]);
    const reviewerIds=[...new Set((r.data||[]).map((x:any)=>x.reviewer_id))];
    const {data:reviewerProfiles}=reviewerIds.length?await supabase.from("dhuroje_profiles").select("id,display_name").in("id",reviewerIds):{data:[] as any[]};
    const rp=Object.fromEntries((reviewerProfiles||[]).map((x:any)=>[x.id,x]));
    setProfile(p.data);setName(p.data?.display_name||"");setCity(p.data?.city||"");setAge(p.data?.age!=null?String(p.data.age):"");setPhone(p.data?.phone||"");setAvatarPreview(p.data?.avatar_url||"");setAvatarFile(null);setReviews((r.data||[]).map((x:any)=>({...x,reviewer:rp[x.reviewer_id]})));
    setStats({active:(l.data||[]).filter((x:any)=>x.status==="available").length,given:(l.data||[]).filter((x:any)=>x.status==="collected").length});
  }
  useEffect(()=>{load();},[user]);
  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setSaving(true);
    const cleanCity=city.trim().slice(0,80), parsedAge=age.trim()?Number(age):null;
    if(parsedAge!==null&&(!Number.isInteger(parsedAge)||parsedAge<13||parsedAge>120)){alert("Mosha duhet të jetë 13–120.");setSaving(false);return;}
    let avatar_url=profile?.avatar_url||null;
    if(avatarFile){
      if(!avatarFile.type.startsWith("image/")){alert("Zgjidh një foto.");setSaving(false);return;}
      if(avatarFile.size>500*1024){alert("Fotoja e kompresuar duhet të jetë maksimumi 500 KB.");setSaving(false);return;}
      const path=user.id+"/"+crypto.randomUUID()+".webp";
      const up=await supabase.storage.from("dhuroje-avatars").upload(path,avatarFile,{contentType:"image/webp",upsert:false});
      if(up.error){alert(up.error.message);setSaving(false);return;}
      avatar_url=supabase.storage.from("dhuroje-avatars").getPublicUrl(path).data.publicUrl;
    }
    const {error}=await supabase.from("dhuroje_profiles").upsert({id:user.id,display_name:name.trim()||user.email?.split("@")[0]||"Përdorues",city:cleanCity||null,age:parsedAge,phone:phone.trim()||null,avatar_url});
    if(error)alert(error.message);else{await load();onChanged();}setSaving(false);
  }
  const avg=reviews.length?reviews.reduce((s,r)=>s+r.rating,0)/reviews.length:0;
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <div className="modal profile-modal">
      <div className="modal-head"><div><p className="eyebrow">PROFILI IM</p><h2>{profile?.display_name||"Përdorues"}</h2><div className="profile-meta"><span>📍 {profile?.city||"Qyteti nuk është vendosur"}</span>{profile?.age!=null&&<span>🎂 {profile.age} vjeç</span>}<span>Anëtar që nga {profile?.created_at?new Date(profile.created_at).toLocaleDateString("sq-AL"):new Date(user.created_at).toLocaleDateString("sq-AL")}</span></div></div><button className="close" onClick={onClose}>×</button></div>
      <form className="profile-form" onSubmit={save}>
        <div className="profile-photo-editor">
          <div className="profile-photo-preview">{avatarPreview?<img src={avatarPreview} alt="Foto e profilit" />:<span>{(name||user.email||"P").slice(0,1).toUpperCase()}</span>}</div>
          <div><label className="photo-button">📷 Zgjidh foto<input type="file" accept="image/*" onChange={async e=>{const file=e.target.files?.[0]||null;if(!file){setAvatarFile(null);return;}try{const compressed=await compressImage(file,800,500*1024);if(compressed){setAvatarFile(compressed);setAvatarPreview(URL.createObjectURL(compressed));}}catch(err:any){alert(err?.message||"Fotoja nuk mund të kompresohej.");}finally{e.currentTarget.value="";}}}/></label><small className="form-help">Foto e profilit · opsionale · kompresohet automatikisht, max 500 KB</small></div>
        </div>
        <label>Emri që shfaqet<input value={name} onChange={e=>setName(e.target.value)} maxLength={60}/></label>
        <label>Qyteti<input value={city} onChange={e=>setCity(e.target.value)} maxLength={80} placeholder="p.sh. Ferizaj"/></label>
        <label>Numri i telefonit <span className="form-help">opsionale</span><input value={phone} onChange={e=>setPhone(e.target.value.replace(/[^0-9+ ()-]/g,"").slice(0,25))} inputMode="tel" type="tel" maxLength={25} placeholder="+383 4x xxx xxx"/></label>
        <label>Mosha <span className="form-help">opsionale</span><input value={age} onChange={e=>setAge(e.target.value.replace(/[^0-9]/g,"").slice(0,3))} inputMode="numeric" type="text" maxLength={3} placeholder="p.sh. 28"/></label>
        <button className="secondary full" disabled={saving}>{saving?"Po ruhet…":"Ruaj profilin"}</button>
      </form>
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

function Messages({user,onClose,initialConversationId,initialError,onListing}:{user:any;onClose:()=>void;initialConversationId?:string;initialError?:string;onListing:(listing:Listing)=>void}){
  const [conversations,setConversations]=useState<any[]>([]);
  const [messages,setMessages]=useState<any[]>([]);
  const [selectedConversation,setSelectedConversation]=useState<string>(initialConversationId||"");
  const [body,setBody]=useState("");
  const [loading,setLoading]=useState(true),[sending,setSending]=useState(false),[error,setError]=useState("");
  const [mobileChat,setMobileChat]=useState(false),[conversationSearch,setConversationSearch]=useState("");
  const draftConversationRef=useRef<{id:string;hasMessages:boolean}>({id:"",hasMessages:true});

  async function load(){
    if(!user)return;
    await supabase.rpc("dhuroje_cleanup_empty_conversations");
    setLoading(true);setError("");
    const {data:members,error:memberError}=await supabase.from("dhuroje_conversation_members").select("conversation_id").eq("user_id",user.id);
    if(memberError){setError("Nuk mund të ngarkoheshin bisedat. Provo përsëri.");setLoading(false);return;}
    const ids=(members||[]).map((x:any)=>x.conversation_id);
    if(!ids.length){setConversations([]);setMessages([]);setSelectedConversation("");setLoading(false);return;}

    const {data:cs,error:conversationError}=await supabase.from("dhuroje_conversations").select("id,listing_id,created_at").in("id",ids);
    if(conversationError){
      setError("Nuk mund të ngarkoheshin bisedat. Provo përsëri.");
      setLoading(false);
      return;
    }
    const rows=cs||[];
    const listingIds=rows.map((x:any)=>x.listing_id).filter(Boolean);
    const {data:listingsData}=listingIds.length?await supabase.from("dhuroje_listings").select("id,title,owner_id,location_name,status").in("id",listingIds):{data:[] as any[]};
    const {data:allMembers}=await supabase.from("dhuroje_conversation_members").select("conversation_id,user_id").in("conversation_id",ids);
    const otherIds=[...new Set((allMembers||[]).filter((m:any)=>m.user_id!==user.id).map((m:any)=>m.user_id))];
    const {data:profiles}=otherIds.length?await supabase.from("dhuroje_profiles").select("id,display_name,avatar_url").in("id",otherIds):{data:[] as any[]};
    const {data:ms,error:messageError}=await supabase.from("dhuroje_messages").select("*").in("conversation_id",ids).order("created_at",{ascending:true});
    if(messageError){
      setError("Nuk mund të ngarkoheshin mesazhet. Provo përsëri.");
      setLoading(false);
      return;
    }

    const listingMap=Object.fromEntries((listingsData||[]).map((x:any)=>[x.id,x]));
    const profileMap=Object.fromEntries((profiles||[]).map((x:any)=>[x.id,x]));
    const otherByConversation:Record<string,string>={};
    (allMembers||[]).forEach((m:any)=>{if(m.user_id!==user.id)otherByConversation[m.conversation_id]=m.user_id;});
    const lastMessageByConversation:Record<string,any>={};
    (ms||[]).forEach((m:any)=>{lastMessageByConversation[m.conversation_id]=m;});

    const enriched=rows.map((c:any)=>({
      ...c,
      listing:listingMap[c.listing_id],
      listingTitle:listingMap[c.listing_id]?.title||"Dhuratë",
      otherUserId:otherByConversation[c.id],
      otherName:profileMap[otherByConversation[c.id]]?.display_name||"Përdorues",
      avatar:profileMap[otherByConversation[c.id]]?.avatar_url||null,
      lastMessage:lastMessageByConversation[c.id]||null
    })).sort((a:any,b:any)=>{
      const at=a.lastMessage?.created_at||a.created_at;
      const bt=b.lastMessage?.created_at||b.created_at;
      return new Date(bt).getTime()-new Date(at).getTime();
    });

    setConversations(enriched);setMessages(ms||[]);
    const requestedConversation=initialConversationId||"";
    const requestedExists=requestedConversation ? enriched.some(c=>c.id===requestedConversation) : false;
    setSelectedConversation(current=>{
      if(requestedConversation) return requestedExists ? requestedConversation : "";
      if(current&&enriched.some(c=>c.id===current))return current;
      return enriched[0]?.id||"";
    });
    if(requestedConversation){
      setMobileChat(requestedExists);
      if(!requestedExists)setError("Kjo bisedë nuk është më e disponueshme ose nuk ke qasje në të.");
    }
    setLoading(false);
  }

  useEffect(()=>{load();},[user,initialConversationId]);
  useEffect(()=>{if(initialError)setError(initialError);},[initialError]);
  useEffect(()=>{
    if(!user)return;
    const ch=supabase.channel("messages-ui-"+user.id)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"dhuroje_messages"},()=>load())
      .subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[user]);

  useEffect(()=>{
    if(initialConversationId){
      setSelectedConversation(initialConversationId);
      setMobileChat(true);
    }
  },[initialConversationId]);
  useEffect(()=>()=>{
    const draft=draftConversationRef.current;
    if(draft.id&&!draft.hasMessages){
      void supabase.rpc("dhuroje_cleanup_empty_conversations");
    }
  },[]);

  const selectedMessages=messages.filter(m=>m.conversation_id===selectedConversation);
  draftConversationRef.current={id:selectedConversation,hasMessages:selectedMessages.length>0};
  const selected=conversations.find(c=>c.id===selectedConversation);
  const visibleConversations=conversations.filter(c=>{
    const q=conversationSearch.trim().toLowerCase();
    if(!q)return true;
    return (c.otherName+" "+c.listingTitle+" "+(c.lastMessage?.body||"")).toLowerCase().includes(q);
  });

  async function send(){
    const text=body.trim();
    if(!selectedConversation||!text||sending)return;
    if(text.length>2000){setError("Mesazhi mund të ketë maksimum 2000 karaktere.");return;}
    setSending(true);
    setError("");

    const {error:e}=await supabase.from("dhuroje_messages").insert({
      conversation_id:selectedConversation,
      sender_id:user.id,
      body:text
    });

    if(e){
      setError(e.message?.includes("infinite recursion")
        ? "Ka një problem me lejet e bisedës. Rifresko faqen dhe provo përsëri."
        : "Mesazhi nuk u dërgua. Provo përsëri.");
    }else{
      setBody("");
      // Optimistic refresh: the realtime listener will also update other clients.
      await load();
    }
    setSending(false);
  }

  function time(v:string){return new Date(v).toLocaleTimeString("sq-AL",{hour:"2-digit",minute:"2-digit"});}
  function day(v:string){return new Date(v).toLocaleDateString("sq-AL",{day:"2-digit",month:"long",year:"numeric"});}
  function initials(name:string){return (name||"P").trim().split(/\\s+/).slice(0,2).map((x:string)=>x[0]).join("").toUpperCase();}
  function selectConversation(id:string){
    setSelectedConversation(id);setMobileChat(true);setError("");
    const p=new URLSearchParams(window.location.search);
    p.set("page","messages");p.set("conversation",id);
    window.history.pushState({page:"messages",conversation:id},"",window.location.pathname+"?"+p.toString());
  }

  return <div className="page-content messages-page">
    <div className="messages-topbar">
      <div><p className="eyebrow">INBOX</p><h1>Mesazhet</h1><p className="messages-subtitle">Bisedat me komunitetin dhe dhuratat që po ndjek.</p></div>
      <button className="close account-close" onClick={()=>{void supabase.rpc("dhuroje_cleanup_empty_conversations");onClose();}} aria-label="Mbyll">×</button>
    </div>

    {error&&<div className="message-error" role="alert">{error}</div>}
    {loading?<div className="messages-loading"><span></span>Po ngarkohen bisedat…</div>:!conversations.length?
      <div className="messages-empty">
        <div className="messages-empty-icon">💬</div><h3>Inbox-i yt është bosh</h3>
        <p>Hap një dhuratë dhe zgjidh <b>Mesazho dhuruesin</b>. Mund të shkruash edhe para se të dërgosh kërkesë.</p>
      </div>:
      <div className={"messages-workspace"+(mobileChat?" mobile-chat-open":"")}>
        <aside className="conversation-list">
          <div className="conversation-list-head">
            <div className="conversation-head-title"><b>Bisedat</b><small>{conversations.length} {conversations.length===1?"bisedë":"biseda"}</small></div>
            <span className="conversation-count">{conversations.length}</span>
          </div>
          <div className="conversation-search">
            <span>⌕</span>
            <input value={conversationSearch} onChange={e=>setConversationSearch(e.target.value)} placeholder="Kërko bisedë..." aria-label="Kërko bisedë"/>
            {conversationSearch&&<button type="button" onClick={()=>setConversationSearch("")} aria-label="Pastro kërkimin">×</button>}
          </div>
          <div className="conversation-items">
            {visibleConversations.length?visibleConversations.map(c=><button key={c.id} className={"conversation-user"+(c.id===selectedConversation?" active":"")} onClick={()=>selectConversation(c.id)}>
              <span className="conversation-avatar">{c.avatar?<img src={c.avatar} alt=""/>:initials(c.otherName)}</span>
              <span className="conversation-user-text"><b>{c.otherName}</b><small className="conversation-product">{c.listingTitle}</small><small>{c.lastMessage?.sender_id===user.id?"Ti: ":""}{c.lastMessage?.body||"Bisedë e re — nis bisedën"}</small></span>
              <span className="conversation-time">{c.lastMessage?time(c.lastMessage.created_at):"E re"}</span>
            </button>):<div className="conversation-no-results"><span>⌕</span><b>Nuk u gjet asnjë bisedë</b><small>Provo emrin e përdoruesit ose dhuratën.</small></div>}
          </div>
        </aside>

        {selected?<section className="chat-panel">
          <header className="professional-chat-header">
            <button className="chat-back" onClick={()=>setMobileChat(false)} aria-label="Kthehu">‹</button>
            <div className="chat-person-avatar">{selected.avatar?<img src={selected.avatar} alt=""/>:initials(selected.otherName)}</div>
            <div className="chat-person-info"><b>{selected.otherName}</b><span>Po flisni për <strong>{selected.listingTitle}</strong></span></div>
            <button className="chat-listing-link" onClick={()=>{const l=selected.listing;if(l){onListing(l);}}}>Shiko dhuratën</button>
          </header>

          <div className="chat-listing-strip">
            <span className="chat-listing-icon">{emoji(selected.listing?.category||"other")}</span>
            <div><b>{selected.listingTitle}</b><small>{selected.listing?.location_name||"Lokacion i panjohur"} · {selected.listing?.status==="reserved"?"E rezervuar":"E disponueshme"}</small></div>
          </div>

          <div className="chat-messages">
            {selectedMessages.length?selectedMessages.map((m,i)=>{
              const previous=selectedMessages[i-1];
              const newDay=!previous||new Date(previous.created_at).toDateString()!==new Date(m.created_at).toDateString();
              return <div key={m.id}>{newDay&&<div className="chat-day"><span>{day(m.created_at)}</span></div>}<div className={m.sender_id===user.id?"message-row mine":"message-row"}><div className="bubble"><p>{m.body}</p><small>{time(m.created_at)}</small></div></div></div>;
            }):<div className="chat-first-message"><b>Bisedë e re</b><span>Thuaji përshëndetje dhe pyet për dhuratën.</span></div>}
          </div>

          <div className="professional-composer">
            <textarea value={body} maxLength={2000} rows={1} onChange={e=>setBody(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder={"Shkruaj "+selected.otherName+"…"} />
            <div><small>{body.length}/2000 · Enter për dërgim</small><button className="primary" disabled={sending||!body.trim()} onClick={send}>{sending?"Po dërgohet…":"Dërgo"}</button></div>
          </div>
        </section>:<div className="chat-no-selection"><span>💬</span><b>Zgjidh një bisedë</b><small>Mesazhet e tua do të shfaqen këtu.</small></div>}
      </div>
    }
  </div>;
}
function Dashboard({user,onClose,onChanged,onChat,onEdit,onMarkGiven,onProfile,onMessages,onListing,onSaved,onRequested,profile}:{user:any;onClose:()=>void;onChanged:()=>void;onChat:(listing:Listing,claimantId:string)=>void;onEdit:(listing:Listing)=>void;onMarkGiven:(listing:Listing)=>void;onProfile:()=>void;onMessages:()=>void;onListing:(listing:Listing)=>void;onSaved:()=>void;onRequested:()=>void;profile:any}){
  const initialSection=new URLSearchParams(typeof window!=="undefined"?window.location.search:"").get("section")||"overview";
  const [section,setSection]=useState<"overview"|"listings"|"requested">(
    initialSection==="listings"||initialSection==="requested"?initialSection:"overview"
  );
  const [mine,setMine]=useState<Listing[]>([]),[wanted,setWanted]=useState<Claim[]>([]),[busy,setBusy]=useState(false);

  async function load(){
    if(!user)return;
    const [{data:ls},{data:myClaims}]=await Promise.all([
      supabase.from("dhuroje_listings").select("*, owner:dhuroje_profiles!dhuroje_listings_owner_id_fkey(id,display_name,avatar_url)").eq("owner_id",user.id).order("created_at",{ascending:false}),
      supabase.from("dhuroje_claims").select("*, listing:dhuroje_listings(*, owner:dhuroje_profiles!dhuroje_listings_owner_id_fkey(id,display_name,avatar_url))").eq("claimant_id",user.id).order("created_at",{ascending:false})
    ]);
    setMine((ls||[]) as Listing[]);
    setWanted((myClaims||[]).filter((x:any)=>x.status!=="cancelled") as any[]);
  }
  useEffect(()=>{load();},[user]);
  useEffect(()=>{
    const sync=()=>{
      const s=new URLSearchParams(window.location.search).get("section")||"overview";
      setSection(s==="listings"||s==="requested"?s:"overview");
    };
    window.addEventListener("popstate",sync);
    return()=>window.removeEventListener("popstate",sync);
  },[]);

  function goSection(next:"overview"|"listings"|"requested"){
    setSection(next);
    const p=new URLSearchParams(window.location.search);
    p.set("page","dashboard");
    if(next==="overview")p.delete("section");else p.set("section",next);
    window.history.pushState({page:"dashboard",section:next},"",window.location.pathname+"?"+p.toString());
  }

  const activeMine=mine.filter(x=>["available","reserved"].includes(x.status));
  const givenCount=mine.filter(x=>x.status==="collected").length;
  const requestedCount=wanted.filter((x:any)=>["pending","accepted"].includes(x.status)).length;

  async function deleteLocal(listing:Listing){
    if(!window.confirm("Ta fshij përgjithmonë këtë shpallje?"))return;
    setBusy(true);
    const {error}=await supabase.rpc("dhuroje_delete_listing",{p_listing_id:listing.id});
    if(error)alert(error.message);else{await load();onChanged();}
    setBusy(false);
  }

  return <div className="page-content account-page">
    <div className="account-page-top">
      <div>
        <p className="eyebrow">LLOGARIA IME</p>
        <h1>Profili im</h1>
        <p className="account-email">{user.email}</p>
      </div>
      <button className="close account-close" onClick={onClose} aria-label="Mbyll">×</button>
    </div>

    <div className="account-hero">
      <div className="account-avatar">{profile?.avatar_url?<img src={profile.avatar_url} alt="" />:(profile?.display_name||user.email||"P").slice(0,1).toUpperCase()}</div>
      <div className="account-hero-main">
        <h2>{profile?.display_name||user.email?.split("@")[0]||"Përdorues"}</h2>
        <p>📍 {profile?.city||"Qyteti nuk është vendosur"}{profile?.age!=null&&<> · 🎂 {profile.age} vjeç</>}</p>
      </div>
      <button className="secondary" onClick={onProfile}>✏️ Ndrysho profilin</button>
    </div>

    <div className="account-stats">
      <button onClick={()=>goSection("listings")}><b>{activeMine.length}</b><span>Shpallje aktive</span></button>
      <button onClick={()=>goSection("listings")}><b>{givenCount}</b><span>Të dhuruara</span></button>
      <button onClick={()=>goSection("requested")}><b>{requestedCount}</b><span>Të kërkuara</span></button>
    </div>

    <nav className="account-sections" aria-label="Llogaria">
      <button className={section==="overview"?"active":""} onClick={()=>goSection("overview")}>👤 Informacioni personal</button>
      <button onClick={onMessages}>💬 Mesazhet</button>
      <button className={section==="listings"?"active":""} onClick={()=>goSection("listings")}>🎁 Shpalljet e mia <span>{activeMine.length}</span></button>
      <button onClick={onSaved}>♥ Të ruajturat / të pëlqyerat</button>
      <button className={section==="requested"?"active":""} onClick={()=>goSection("requested")}>🙋 Dhuratat e kërkuara <span>{requestedCount}</span></button>
    </nav>

    {section==="overview"&&<section className="account-section">
      <div className="account-section-head"><div><p className="eyebrow">PERSONALE</p><h2>Informacioni personal</h2><p>Detajet që shfaqen në profilin tënd te Dhuroje.</p></div><button className="secondary" onClick={onProfile}>Ndrysho</button></div>
      <div className="personal-details">
        <div><span>👤 Emri</span><b>{profile?.display_name||"—"}</b></div>
        <div><span>📞 Telefoni</span><b>{profile?.phone||"—"}</b></div>
        <div><span>📷 Foto profili</span><b>{profile?.avatar_url?"E vendosur":"Nuk është vendosur"}</b></div>
        <div><span>📍 Qyteti</span><b>{profile?.city||"—"}</b></div>
        <div><span>🎂 Mosha</span><b>{profile?.age!=null?profile.age+" vjeç":"—"}</b></div>
        <div><span>✉️ Email</span><b>{user.email||"—"}</b></div>
        <div><span>📅 Anëtar që nga</span><b>{new Date(profile?.created_at||user.created_at).toLocaleDateString("sq-AL")}</b></div>
      </div>
    </section>}

    {section==="listings"&&<section className="account-section">
      <div className="account-section-head"><div><p className="eyebrow">DHURATAT E MIA</p><h2>Shpalljet e mia</h2><p>Menaxho dhuratat aktive dhe ato që i ke dhënë.</p></div></div>
      <div className="dash-list">{activeMine.length?activeMine.map(x=><div className="dash-row account-list-row" key={x.id} onClick={()=>onListing(x)}>
        <span className="dash-icon">{emoji(x.category)}</span>
        <div><b>{x.title}</b><small>{x.status==="reserved"?"E rezervuar":"E disponueshme"} · {x.location_name||"Pa lokacion"}</small></div>
        <button disabled={busy} onClick={e=>{e.stopPropagation();onEdit(x)}}>✏️</button>
        <button disabled={busy} onClick={e=>{e.stopPropagation();onMarkGiven(x)}}>✓</button>
        <button disabled={busy} className="danger" onClick={e=>{e.stopPropagation();deleteLocal(x)}}>🗑️</button>
      </div>):<div className="empty">Nuk ke shpallje aktive.</div>}</div>
    </section>}

    {section==="requested"&&<section className="account-section">
      <div className="account-section-head"><div><p className="eyebrow">KËRKESAT E MIA</p><h2>Dhuratat e kërkuara</h2><p>Këtu i sheh kërkesat që ke dërguar për dhurata.</p></div></div>
      <div className="dash-list">{wanted.length?wanted.map((x:any)=><div className="dash-row account-list-row" key={x.id} onClick={()=>x.listing&&onListing(x.listing)}>
        <span className="dash-icon">{emoji(x.listing?.category||"other")}</span>
        <div><b>{x.listing?.title||"Dhuratë"}</b><small>{x.status==="pending"?"Në pritje":x.status==="accepted"?"Pranuar":x.status} · {x.listing?.location_name||""}</small></div>
        {x.status==="pending"&&<button disabled={busy} className="danger" onClick={async e=>{e.stopPropagation();setBusy(true);const r=await supabase.from("dhuroje_claims").update({status:"cancelled"}).eq("id",x.id).eq("claimant_id",user.id).eq("status","pending");if(r.error)alert(r.error.message);await load();setBusy(false);}}>↩ Tërhiq</button>}
        {x.status==="accepted"&&x.listing&&<button onClick={e=>{e.stopPropagation();onChat(x.listing,x.listing.owner_id)}}>💬 Mesazho</button>}
      </div>):<div className="empty">Nuk ke kërkuar ende ndonjë dhuratë.</div>}</div>
    </section>}
  </div>;
}