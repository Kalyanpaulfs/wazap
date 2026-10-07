import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import CrmWorkspaceBar from './CrmWorkspaceBar';
import './experience.css';
import {redirect} from 'next/navigation';
export default async function CrmLayout({children}:{children:React.ReactNode}){const session=await getServerSession(authOptions);if(!(session?.user as {isAdmin?:boolean}|undefined)?.isAdmin)redirect('/login');return <><CrmWorkspaceBar/>{children}</>;}
