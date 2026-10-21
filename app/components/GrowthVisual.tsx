import dimensions from '@/lib/growth-art-dimensions.json';
import styles from './GrowthVisual.module.css';
export default function GrowthVisual({kind='routing',label='Topic illustration',priority=false}:{kind?:string;label?:string;priority?:boolean}) {
 const key=(kind in dimensions?kind:'routing') as keyof typeof dimensions;
 const [width,height]=dimensions[key];
 const src=`/growth/art/${key}-${key==='inbox'?'v1':'v2'}.webp`;
 // inbox-v1 is the original dark-style art; it has no light/dark pair.
 const darkSrc=key==='inbox'?src:`/growth/art/dark/${key}-v2.webp`;
 return <div className={`${styles.frame} gv-art`} data-resource-art={key}><img className="art-light" src={src} width={width} height={height} alt={label} loading={priority?"eager":"lazy"} fetchPriority={priority?"high":undefined} decoding="async"/><img className="art-dark" src={darkSrc} width={width} height={height} alt="" aria-hidden="true" loading={priority?"eager":"lazy"} decoding="async"/></div>;
}
