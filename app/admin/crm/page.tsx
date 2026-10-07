import {getServerSession} from "next-auth";
import {authOptions} from "@/lib/auth";
import {redirect} from "next/navigation";
import CrmClient from "./CrmClient";
export const metadata={title:"Lead CRM — Wazap",robots:{index:false,follow:false}};
export default async function CrmPage(){const session=await getServerSession(authOptions);if(!(session?.user as {isAdmin?:boolean}|undefined)?.isAdmin)redirect("/login");return <CrmClient/>;}
