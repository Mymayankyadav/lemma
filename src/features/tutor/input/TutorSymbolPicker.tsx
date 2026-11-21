import {useRef,useState} from 'react';
import {Sheet} from '../../../ui/v7/components';
import {searchSymbols, symbolById, SYMBOL_CATEGORIES, type SymbolCategory} from './symbolCatalog';

export function TutorSymbolPicker({recent,onPick,onClose,error}:{
  recent:readonly string[];error:string;onPick:(id:string)=>void;onClose:()=>void;
}) {
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState<SymbolCategory|''>('');
  const [recentOnly,setRecentOnly]=useState(recent.length>0);
  const results=useRef<HTMLUListElement>(null);
  const symbols=query.trim()||!recentOnly
    ?searchSymbols(query,category||undefined)
    :recent.map(symbolById).filter(symbol=>symbol!==undefined);
  return <Sheet open title="Symbols" onClose={onClose}>
    <div className="tutor-symbol-picker">
      {error && <p role="alert">{error}</p>}
      <input type="search" className="v7-field" aria-label="Search symbols" placeholder="Name, shape, or TeX"
        autoComplete="off" spellCheck={false} value={query} onChange={event=>setQuery(event.currentTarget.value)}
        onKeyDown={event=>{
          if(event.key!=='ArrowDown'||event.nativeEvent.isComposing)return;
          const first=results.current?.querySelector('button');
          if(first){event.preventDefault();first.focus();}
        }}/>
      <div className="tutor-symbol-categories" role="group" aria-label="Symbol categories">
        {recent.length>0&&<button type="button" className="v7-filter-chip" aria-pressed={recentOnly&&!query.trim()}
          onClick={()=>{setCategory('');setQuery('');setRecentOnly(true);}}>Recent</button>}
        <button type="button" className="v7-filter-chip" aria-pressed={!category&&(!recentOnly||!!query.trim())}
          onClick={()=>{setCategory('');setRecentOnly(false);}}>All symbols</button>
        {SYMBOL_CATEGORIES.map(name=><button type="button" className="v7-filter-chip" key={name} aria-pressed={category===name&&!recentOnly}
          onClick={()=>{setCategory(name);setRecentOnly(false);}}>{name}</button>)}
      </div>
      {symbols.length ? <ul ref={results} className="tutor-symbol-matches" aria-label="Symbol choices">{symbols.map(symbol=>
        <li key={symbol.id}><button type="button" onClick={()=>onPick(symbol.id)}
          aria-label={symbol.name}><span aria-hidden="true">{symbol.glyph}</span><small>{symbol.name}</small></button></li>)}</ul>
        : <p role="status">No symbols match.</p>}
    </div>
  </Sheet>;
}
