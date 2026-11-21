import {useLocation,useNavigate} from 'react-router';

export function useDetailBack(fallback='/'){
 const location=useLocation(),navigate=useNavigate();
 return ()=>{
  if(location.key!=='default'&&window.history.state?.idx>0)navigate(-1);
  else navigate(fallback);
 };
}
