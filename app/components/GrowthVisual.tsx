import dimensions from '@/lib/growth-art-dimensions.json';
import styles from './GrowthVisual.module.css';
export default function GrowthVisual({kind='routing',label='Topic illustration',priority=false}:{kind?:string;label?:string;priority?:boolean}) {
 const key=(kind in dimensions?kind:'routing') as keyof typeof dimensions;
 const [width,height]=dimensions[key];
 return <div className={`${styles.frame} gv-art`} data-resource-art={key}><img src={`/growth/art/${key}-${key==='inbox'?'v1':'v2'}.webp`} width={width} height={height} alt={label} loading={priority?"eager":"lazy"} fetchPriority={priority?"high":undefined} decoding="async"/></div>;
}
