import dimensions from '@/lib/growth-art-dimensions.json';
import styles from './GrowthVisual.module.css';
export default function GrowthVisual({kind='routing',label='Topic illustration'}:{kind?:string;label?:string}) {
 const key=(kind in dimensions?kind:'routing') as keyof typeof dimensions;
 const [width,height]=dimensions[key];
 return <div className={`${styles.frame} gv-art`} data-resource-art={key}><img src={`/growth/art/${key}-v1.webp`} width={width} height={height} alt={label} loading="lazy" decoding="async"/></div>;
}
