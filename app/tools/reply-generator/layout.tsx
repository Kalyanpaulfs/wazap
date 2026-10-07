import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";
export const metadata: Metadata={title:"Free WhatsApp Customer Reply Generator",description:"Create clear, professional WhatsApp replies for sales, support, complaints, pricing questions and follow-ups in seconds, then review and copy your message.",alternates:{canonical:"https://wazap.lt/tools/reply-generator"}};
export default function Layout({children}:{children:React.ReactNode}){return <>{children}<ToolSeo k="reply-generator" /></>}
