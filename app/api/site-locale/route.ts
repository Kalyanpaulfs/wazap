import { SITE_LOCALE_VERSION } from '@/lib/site-locale-version';
import { NextRequest,NextResponse } from 'next/server';
import { countryForRequest } from '@/lib/site-country';
import { SITE_COUNTRY_LANGUAGES,normalizeSiteLanguage,siteLanguageForCountry,siteDirection } from '@/lib/site-languages';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const country=countryForRequest(req.headers);
 const preference=normalizeSiteLanguage(req.nextUrl.searchParams.get('language'))||normalizeSiteLanguage(req.cookies.get('wazap_site_language')?.value);
 const language=preference||siteLanguageForCountry(country,req.headers.get('accept-language')||'');
 return NextResponse.json({catalogVersion:SITE_LOCALE_VERSION,country,language,direction:siteDirection(language),source:preference?'preference':country&&SITE_COUNTRY_LANGUAGES[country]?'country':'browser'},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie, Accept-Language'}});
}
