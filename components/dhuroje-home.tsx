'use client';

import { useMemo, useState } from "react";

type Category = "Të gjitha" | "Ushqim" | "Veshmbathje" | "Shtëpi" | "Elektronikë" | "Fëmijë" | "Libra" | "Të tjera";
type Listing = { id:number; title:string; category:Exclude<Category,"Të gjitha">; distance:string; location:string; emoji:string; available:string; description:string };

const initialListings: Listing[] = [
  {id:1,title:"Bukë dhe produkte furre",category:"Ushqim",distance:"0.8 km",location:"Ferizaj",emoji:"🥖",available:"Sot deri 20:00",description:"Paketime të paprekura, të marra sot."},
  {id:2,title:"Rroba për fëmijë",category:"Fëmijë",distance:"1.2 km",location:"Ferizaj",emoji:"👕",available:"Deri nesër",description:"Disa palë rroba të pastra, madhësi të ndryshme."},
  {id:3,title:"Karrige druri",category:"Shtëpi",distance:"1.7 km",location:"Ferizaj",emoji:"🪑",available:"Këtë javë",description:"Karrige e përdorur, funksionale."},
  {id:4,title:"Libra shkollorë",category:"Libra",distance:"2.1 km",location:"Ferizaj",emoji:"📚",available:"Deri të dielën",description:"Libra në gjendje të mirë."}
];

export default function DhurojeHome() {
  const [category,setCategory]=useState<Category>("Të gjitha");
  const [listings,setListings]=useState(initialListings);
  const [showGive,setShowGive]=useState(false);\n  const [showMenu,setShowMenu]=useState(false);\n  const [showFilters,setShowFilters]=useState(false);
  const [claimed,setClaimed]=useState<number[]>([]);
  const [query,setQuery]=useState("");

  const filtered=useMemo(()=>listings.filter(item=>{
    const categoryMatch=category==="Të gjitha"||item.category===category;
    const queryMatch=(item.title+" "+item.description).toLowerCase().includes(query.toLowerCase());
    return categoryMatch&&queryMatch;
  }),[category,listings,query]);

  function claim(id:number){setClaimed(current=>current.includes(id)?current:[...current,id]);}
  function addListing(formData:FormData){
    const title=String(formData.get("title")||"").trim();
    const newCategory=String(formData.get("category")||"Të tjera") as Exclude<Category,"Të gjitha">;
    const description=String(formData.get("description")||"").trim();
    if(!title)return;
    setListings(current=>[{id:Date.now(),title,category:newCategory,description:description||"Pa përshkrim.",distance:"Pranë teje",location:"Lokacioni yt",emoji:newCategory==="Ushqim"?"🍎":newCategory==="Veshmbathje"?"👕":"🎁",available:"Sapo u postua"},...current]);
    setShowGive(false);
  }

  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">D</span><span>Dhuroje</span></div><div className="top-actions"><button className="header-link" onClick={()=>setShowGive(true)}>Dhuro</button><button className="profile-button" onClick={()=>setShowMenu(!showMenu)}>●</button>{showMenu&&<div className="profile-menu"><strong>Dhuroje</strong><button>Hyr / Regjistrohu</button><button>Shpalljet e mia</button><button>Mesazhet</button></div>}</div></header>
    <section className="hero"><div><p className="eyebrow">DHURATA PRANË TEJE</p><h1>Gjej.<br/><span>Merr. Dhuro.</span></h1><p className="hero-copy">Gjëra falas nga njerëzit e komunitetit tënd. Jepu një jetë të dytë.</p></div><div className="hero-actions"><button className="primary" onClick={()=>setShowGive(true)}>＋ Dhuro një gjë</button></div></section>
    <section className="search-wrap"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Kërko ushqim, rroba, mobilie..."/></section>
    <section className="categories">{(["Të gjitha","Ushqim","Veshmbathje","Shtëpi","Elektronikë","Fëmijë","Libra","Të tjera"] as Category[]).map(item=><button key={item} className={category===item?"chip active":"chip"} onClick={()=>setCategory(item)}>{item}</button>)}</section>
    <section className="location-row"><div><span className="pin">⌖</span><div><strong>Ferizaj</strong><small>Shpallje në zonën tënde</small></div></div><div className="location-actions"><button className="filter-button" onClick={()=>setShowFilters(!showFilters)}>☷ Filtro</button><button className="map-toggle">🗺️ Harta</button></div></section>
    <section className="section-head"><div><p className="eyebrow">FALAS PRANË TEJE</p><h2>{filtered.length} dhurata</h2></div><button className="sort">Më të rejat ▾</button></section>{showFilters&&<div className="filter-panel"><strong>Afërsia</strong><button>Brenda 5 km</button><button>Brenda 10 km</button><button>Të gjitha</button></div>}
    <section className="listing-grid">{filtered.map(item=>{const isClaimed=claimed.includes(item.id);return <article className="card" key={item.id}><div className="card-image"><span>{item.emoji}</span><b>FALAS</b></div><div className="card-body"><div className="meta"><span>{item.category}</span><span>📍 {item.distance}</span></div><h3>{item.title}</h3><p>{item.description}</p><div className="card-footer"><small>⌖ {item.location} · {item.available}</small><button className={isClaimed?"claimed":"claim"} onClick={()=>claim(item.id)}>{isClaimed?"Kërkuar ✓":"Kërko"}</button></div></div></article>})}</section>
    {filtered.length===0&&<div className="empty">Nuk u gjet asgjë. Provo një kategori tjetër.</div>}
    {showGive&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setShowGive(false)}><form className="modal" action={addListing}><div className="modal-head"><div><p className="eyebrow">DHUROJE</p><h2>Posto diçka falas</h2></div><button type="button" className="close" onClick={()=>setShowGive(false)}>×</button></div><label>Çfarë po dhuron?<input name="title" required placeholder="p.sh. 5 pako bukë"/></label><label>Kategoria<select name="category" defaultValue="Ushqim">{["Ushqim","Veshmbathje","Shtëpi","Elektronikë","Fëmijë","Libra","Të tjera"].map(x=><option key={x}>{x}</option>)}</select></label><label>Përshkrimi<textarea name="description" placeholder="Gjendja, sasia, kushtet e marrjes..."/></label><div className="food-note">🍎 Për ushqimin: në versionin e plotë do të kërkojmë afatin e përdorimit dhe nëse duhet frigorifer.</div><button className="primary full" type="submit">Publiko falas</button></form></div>}
    <nav className="bottom-nav"><button className="nav-active">⌂<span>Eksploro</span></button><button>♡<span>Ruajturat</span></button><button onClick={()=>setShowGive(true)} className="nav-add">＋</button><button>▱<span>Mesazhet</span></button><button onClick={()=>setShowMenu(!showMenu)}>●<span>Profili</span></button></nav>
  </main>;
}