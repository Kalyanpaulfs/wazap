import ProductMotionScene from './ProductMotionScene';
type Scene='crm'|'inbox'|'ai'|'platform';
export default function LandingVisual({scene}:{scene:Scene}) {return <div style={{margin:'32px auto 0',maxWidth:900}}><ProductMotionScene kind={scene==='inbox'?'team-inbox':scene} label={`Animated ${scene} workflow illustration`}/></div>;}
