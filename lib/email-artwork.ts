import type { EmailChannel } from './email-brand';
const labels:Record<string,string[]>={
 en:['Welcome to your Wazap workspace','Wazap billing and subscriptions','Wazap support and team assistance','Useful Wazap updates and guidance'],
 es:['Bienvenido a tu espacio Wazap','Facturación y suscripciones de Wazap','Asistencia y equipo de Wazap','Novedades y consejos útiles de Wazap'],
 ru:['Добро пожаловать в Wazap','Оплата и подписки Wazap','Поддержка и помощь команды Wazap','Полезные новости и советы Wazap'],
 zh:['欢迎使用 Wazap 工作空间','Wazap 账单和订阅','Wazap 支持与团队帮助','实用的 Wazap 更新和指导'],
 it:['Benvenuto nel tuo spazio Wazap','Fatturazione e abbonamenti Wazap','Assistenza e supporto del team Wazap','Novità e consigli utili di Wazap'],
 tr:['Wazap çalışma alanınıza hoş geldiniz','Wazap faturalandırma ve abonelikleri','Wazap destek ve ekip yardımı','Faydalı Wazap güncellemeleri ve rehberlik'],
 pt:['Bem-vindo ao seu espaço Wazap','Faturação e subscrições Wazap','Apoio e assistência da equipa Wazap','Novidades e orientações úteis do Wazap'],
 ar:['مرحباً بك في مساحة عمل Wazap','الفوترة والاشتراكات في Wazap','دعم Wazap ومساعدة الفريق','تحديثات وإرشادات مفيدة من Wazap'],
 fr:['Bienvenue dans votre espace Wazap','Facturation et abonnements Wazap','Assistance et aide de l’équipe Wazap','Actualités et conseils utiles de Wazap'],
 hi:['आपके Wazap कार्यक्षेत्र में स्वागत है','Wazap बिलिंग और सदस्यता','Wazap सहायता और टीम की मदद','उपयोगी Wazap अपडेट और मार्गदर्शन']
};
export function emailArtwork(channel:EmailChannel,language='en'){
 const kind=channel==='hello'?'welcome':channel==='joseph'?'marketing':channel;
 const index=({welcome:0,billing:1,support:2,marketing:3})[kind];
 const alt=(labels[language.toLowerCase().split(/[-_]/)[0]]||labels.en)[index];
 return `<table role="presentation" data-wazap-artwork="${kind}" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;margin:0 auto;background:#f5f3ed"><tr><td style="padding:0;background:#f5f3ed"><img src="https://wazap.lt/email-assets/wazap-${kind}-20261007.jpg" alt="${alt}" width="600" border="0" style="display:block;width:100%;max-width:600px;height:auto;border:0;color:#14281d;font:14px Arial,sans-serif"></td></tr></table>`;
}
