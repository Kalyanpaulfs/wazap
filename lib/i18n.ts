import type { SupportedLanguage } from "./localization";

export const PRICING_TEXT: Record<SupportedLanguage, {
  detected: string;
  estimated: string;
  billedUsd: string;
  month: string;
  accountRequired: string;
  paymentMethods: string;
  choosePlan: string;
  subscribePaypal: string;
  subscribeCard: string;
}> = {
  en: {
    detected: "Localized automatically",
    estimated: "Estimated for your country",
    billedUsd: "Checkout is billed in USD",
    month: "month",
    accountRequired: "Create your account before payment",
    paymentMethods: "PayPal and card checkout options are shown after sign-in.",
    choosePlan: "choose a monthly plan below to unlock your account.",
    subscribePaypal: "Subscribe with PayPal",
    subscribeCard: "Subscribe by card",
  },
  ar: {
    detected: "تم التخصيص تلقائيا",
    estimated: "تقدير حسب بلدك",
    billedUsd: "يتم الدفع بالدولار الأمريكي",
    month: "شهر",
    accountRequired: "أنشئ حسابك قبل الدفع",
    paymentMethods: "تظهر خيارات PayPal والدفع بالبطاقة بعد تسجيل الدخول.",
    choosePlan: "اختر خطة شهرية بالأسفل لتفعيل حسابك.",
    subscribePaypal: "اشترك عبر PayPal",
    subscribeCard: "اشترك بالبطاقة",
  },
  es: {
    detected: "Localizado automáticamente",
    estimated: "Estimado para tu país",
    billedUsd: "El pago se cobra en USD",
    month: "mes",
    accountRequired: "Crea tu cuenta antes de pagar",
    paymentMethods: "PayPal y pago con tarjeta aparecen después de iniciar sesión.",
    choosePlan: "elige un plan mensual abajo para desbloquear tu cuenta.",
    subscribePaypal: "Suscribirse con PayPal",
    subscribeCard: "Suscribirse con tarjeta",
  },
  fr: {
    detected: "Localisé automatiquement",
    estimated: "Estimation pour votre pays",
    billedUsd: "Le paiement est facturé en USD",
    month: "mois",
    accountRequired: "Créez votre compte avant le paiement",
    paymentMethods: "PayPal et le paiement par carte s'affichent après connexion.",
    choosePlan: "choisissez un forfait mensuel ci-dessous pour débloquer votre compte.",
    subscribePaypal: "S'abonner avec PayPal",
    subscribeCard: "S'abonner par carte",
  },
  de: {
    detected: "Automatisch lokalisiert",
    estimated: "Schätzung für Ihr Land",
    billedUsd: "Checkout wird in USD berechnet",
    month: "Monat",
    accountRequired: "Erstellen Sie vor der Zahlung ein Konto",
    paymentMethods: "PayPal und Kartenzahlung erscheinen nach der Anmeldung.",
    choosePlan: "wählen Sie unten einen Monatsplan, um Ihr Konto freizuschalten.",
    subscribePaypal: "Mit PayPal abonnieren",
    subscribeCard: "Mit Karte abonnieren",
  },
  pt: {
    detected: "Localizado automaticamente",
    estimated: "Estimado para o seu país",
    billedUsd: "O checkout é cobrado em USD",
    month: "mês",
    accountRequired: "Crie sua conta antes do pagamento",
    paymentMethods: "PayPal e cartão aparecem depois do login.",
    choosePlan: "escolha um plano mensal abaixo para desbloquear sua conta.",
    subscribePaypal: "Assinar com PayPal",
    subscribeCard: "Assinar com cartão",
  },
  it: {
    detected: "Localizzato automaticamente",
    estimated: "Stimato per il tuo paese",
    billedUsd: "Il pagamento viene addebitato in USD",
    month: "mese",
    accountRequired: "Crea il tuo account prima del pagamento",
    paymentMethods: "PayPal e pagamento con carta vengono mostrati dopo l'accesso.",
    choosePlan: "scegli un piano mensile qui sotto per sbloccare il tuo account.",
    subscribePaypal: "Abbonati con PayPal",
    subscribeCard: "Abbonati con carta",
  },
  tr: {
    detected: "Otomatik yerelleştirildi",
    estimated: "Ülkeniz için tahmini",
    billedUsd: "Ödeme USD olarak alınır",
    month: "ay",
    accountRequired: "Ödeme öncesi hesabınızı oluşturun",
    paymentMethods: "PayPal ve kart seçenekleri girişten sonra gösterilir.",
    choosePlan: "hesabınızı açmak için aşağıdan aylık plan seçin.",
    subscribePaypal: "PayPal ile abone ol",
    subscribeCard: "Kart ile abone ol",
  },
  hi: {
    detected: "अपने आप स्थानीय बनाया गया",
    estimated: "आपके देश के लिए अनुमान",
    billedUsd: "चेकआउट USD में बिल होता है",
    month: "माह",
    accountRequired: "भुगतान से पहले अपना खाता बनाएं",
    paymentMethods: "लॉग इन के बाद PayPal और कार्ड विकल्प दिखेंगे.",
    choosePlan: "खाता अनलॉक करने के लिए नीचे मासिक प्लान चुनें.",
    subscribePaypal: "PayPal से सदस्यता लें",
    subscribeCard: "कार्ड से सदस्यता लें",
  },
  id: {
    detected: "Dilokalkan otomatis",
    estimated: "Perkiraan untuk negara Anda",
    billedUsd: "Checkout ditagih dalam USD",
    month: "bulan",
    accountRequired: "Buat akun sebelum membayar",
    paymentMethods: "PayPal dan kartu muncul setelah masuk.",
    choosePlan: "pilih paket bulanan di bawah untuk membuka akun Anda.",
    subscribePaypal: "Berlangganan dengan PayPal",
    subscribeCard: "Berlangganan dengan kartu",
  },
  ru: {
    detected: "Автоматическая локализация",
    estimated: "Оценка для вашей страны",
    billedUsd: "Оплата списывается в USD",
    month: "месяц",
    accountRequired: "Создайте аккаунт перед оплатой",
    paymentMethods: "PayPal и оплата картой появятся после входа.",
    choosePlan: "выберите месячный план ниже, чтобы открыть доступ.",
    subscribePaypal: "Подписаться через PayPal",
    subscribeCard: "Подписаться картой",
  },
  zh: {
    detected: "已自动本地化",
    estimated: "按你的国家估算",
    billedUsd: "结账以美元计费",
    month: "月",
    accountRequired: "付款前先创建账户",
    paymentMethods: "登录后显示 PayPal 和银行卡付款选项。",
    choosePlan: "在下方选择月度方案以解锁账户。",
    subscribePaypal: "使用 PayPal 订阅",
    subscribeCard: "使用银行卡订阅",
  },
  lv: {
    detected: "Automātiski lokalizēts", estimated: "Aptuvenā cena jūsu valstij", billedUsd: "Maksājums tiek veikts USD", month: "mēnesī",
    accountRequired: "Izveidojiet kontu pirms maksājuma", paymentMethods: "PayPal un kartes maksājumi ir pieejami pēc pierakstīšanās.", choosePlan: "izvēlieties mēneša plānu zemāk.", subscribePaypal: "Abonēt ar PayPal", subscribeCard: "Abonēt ar karti",
  },
  ms: {
    detected: "Dilokalkan secara automatik", estimated: "Anggaran untuk negara anda", billedUsd: "Pembayaran dicaj dalam USD", month: "bulan",
    accountRequired: "Cipta akaun sebelum membayar", paymentMethods: "Pilihan PayPal dan kad dipaparkan selepas log masuk.", choosePlan: "pilih pelan bulanan di bawah.", subscribePaypal: "Langgan dengan PayPal", subscribeCard: "Langgan dengan kad",
  },
  nl: {
    detected: "Automatisch gelokaliseerd", estimated: "Schatting voor uw land", billedUsd: "Afrekenen gebeurt in USD", month: "maand",
    accountRequired: "Maak een account voordat u betaalt", paymentMethods: "PayPal en kaartbetaling verschijnen na het inloggen.", choosePlan: "kies hieronder een maandabonnement.", subscribePaypal: "Abonneren met PayPal", subscribeCard: "Abonneren met kaart",
  },
  ka: {
    detected: "ავტომატურად ლოკალიზებულია", estimated: "სავარაუდო ფასი თქვენი ქვეყნისთვის", billedUsd: "გადახდა ხდება USD-ში", month: "თვე",
    accountRequired: "გადახდამდე შექმენით ანგარიში", paymentMethods: "PayPal და ბარათით გადახდა გამოჩნდება შესვლის შემდეგ.", choosePlan: "აირჩიეთ თვიური გეგმა ქვემოთ.", subscribePaypal: "გამოწერა PayPal-ით", subscribeCard: "გამოწერა ბარათით",
  },
  ja: {
    detected: "自動的にローカライズされました", estimated: "お住まいの国での概算", billedUsd: "決済は米ドルで請求されます", month: "月",
    accountRequired: "お支払い前にアカウントを作成してください", paymentMethods: "ログイン後にPayPalとカード決済が表示されます。", choosePlan: "以下から月額プランを選択してください。", subscribePaypal: "PayPalで登録", subscribeCard: "カードで登録",
  },
  fa: {
    detected: "به‌صورت خودکار بومی‌سازی شد", estimated: "برآورد برای کشور شما", billedUsd: "پرداخت به دلار آمریکا انجام می‌شود", month: "ماه",
    accountRequired: "پیش از پرداخت حساب بسازید", paymentMethods: "گزینه‌های PayPal و کارت پس از ورود نمایش داده می‌شوند.", choosePlan: "یک طرح ماهانه انتخاب کنید.", subscribePaypal: "اشتراک با PayPal", subscribeCard: "اشتراک با کارت",
  },
  ur: {
    detected: "خودکار طور پر مقامی بنایا گیا", estimated: "آپ کے ملک کے لیے تخمینہ", billedUsd: "ادائیگی امریکی ڈالر میں ہوگی", month: "ماہ",
    accountRequired: "ادائیگی سے پہلے اکاؤنٹ بنائیں", paymentMethods: "لاگ اِن کے بعد PayPal اور کارڈ کے اختیارات دکھائی دیں گے۔", choosePlan: "ذیل میں ماہانہ پلان منتخب کریں۔", subscribePaypal: "PayPal سے سبسکرائب کریں", subscribeCard: "کارڈ سے سبسکرائب کریں",
  },
  bn: {
    detected: "স্বয়ংক্রিয়ভাবে স্থানীয় করা হয়েছে", estimated: "আপনার দেশের জন্য আনুমানিক", billedUsd: "চেকআউট USD-তে বিল করা হয়", month: "মাস",
    accountRequired: "পেমেন্টের আগে অ্যাকাউন্ট তৈরি করুন", paymentMethods: "লগইনের পরে PayPal ও কার্ড অপশন দেখা যাবে।", choosePlan: "নিচে মাসিক প্ল্যান বেছে নিন।", subscribePaypal: "PayPal দিয়ে সাবস্ক্রাইব করুন", subscribeCard: "কার্ড দিয়ে সাবস্ক্রাইব করুন",
  },
  pl: {
    detected: "Automatycznie zlokalizowano", estimated: "Szacunkowo dla Twojego kraju", billedUsd: "Płatność jest rozliczana w USD", month: "miesiąc",
    accountRequired: "Utwórz konto przed płatnością", paymentMethods: "PayPal i karta są dostępne po zalogowaniu.", choosePlan: "wybierz plan miesięczny poniżej.", subscribePaypal: "Subskrybuj przez PayPal", subscribeCard: "Subskrybuj kartą",
  },
  cs: {
    detected: "Automaticky lokalizováno", estimated: "Odhad pro vaši zemi", billedUsd: "Platba je účtována v USD", month: "měsíc",
    accountRequired: "Před platbou si vytvořte účet", paymentMethods: "PayPal a platba kartou se zobrazí po přihlášení.", choosePlan: "vyberte si měsíční tarif.", subscribePaypal: "Předplatit přes PayPal", subscribeCard: "Předplatit kartou",
  },
  ro: {
    detected: "Localizat automat", estimated: "Estimare pentru țara ta", billedUsd: "Plata este facturată în USD", month: "lună",
    accountRequired: "Creează un cont înainte de plată", paymentMethods: "PayPal și plata cu cardul apar după autentificare.", choosePlan: "alege un plan lunar mai jos.", subscribePaypal: "Abonează-te cu PayPal", subscribeCard: "Abonează-te cu cardul",
  },
  uk: {
    detected: "Автоматично локалізовано", estimated: "Орієнтовно для вашої країни", billedUsd: "Оплата стягується в USD", month: "місяць",
    accountRequired: "Створіть обліковий запис перед оплатою", paymentMethods: "PayPal і картка доступні після входу.", choosePlan: "виберіть місячний план нижче.", subscribePaypal: "Підписатися через PayPal", subscribeCard: "Підписатися карткою",
  },
  ko: {
    detected: "자동으로 현지화됨", estimated: "거주 국가 기준 예상 금액", billedUsd: "결제는 USD로 청구됩니다", month: "월",
    accountRequired: "결제 전에 계정을 만드세요", paymentMethods: "로그인 후 PayPal과 카드 결제가 표시됩니다.", choosePlan: "아래에서 월간 요금제를 선택하세요.", subscribePaypal: "PayPal로 구독", subscribeCard: "카드로 구독",
  },
  th: {
    detected: "ปรับภาษาอัตโนมัติแล้ว", estimated: "ราคาโดยประมาณสำหรับประเทศของคุณ", billedUsd: "ชำระเงินจริงเป็น USD", month: "เดือน",
    accountRequired: "สร้างบัญชีก่อนชำระเงิน", paymentMethods: "ตัวเลือก PayPal และบัตรจะแสดงหลังเข้าสู่ระบบ", choosePlan: "เลือกแผนรายเดือนด้านล่าง", subscribePaypal: "สมัครด้วย PayPal", subscribeCard: "สมัครด้วยบัตร",
  },
  vi: {
    detected: "Đã tự động bản địa hóa", estimated: "Ước tính cho quốc gia của bạn", billedUsd: "Thanh toán được tính bằng USD", month: "tháng",
    accountRequired: "Tạo tài khoản trước khi thanh toán", paymentMethods: "PayPal và thẻ hiển thị sau khi đăng nhập.", choosePlan: "chọn gói hàng tháng bên dưới.", subscribePaypal: "Đăng ký bằng PayPal", subscribeCard: "Đăng ký bằng thẻ",
  },
  sw: {
    detected: "Imebadilishwa kiotomatiki", estimated: "Makadirio kwa nchi yako", billedUsd: "Malipo yanatozwa kwa USD", month: "mwezi",
    accountRequired: "Fungua akaunti kabla ya kulipa", paymentMethods: "PayPal na kadi huonekana baada ya kuingia.", choosePlan: "chagua mpango wa kila mwezi hapa chini.", subscribePaypal: "Jiunge kwa PayPal", subscribeCard: "Jiunge kwa kadi",
  },
  fil: {
    detected: "Awtomatikong isinalokalisa", estimated: "Tantya para sa iyong bansa", billedUsd: "USD ang sisingilin sa checkout", month: "buwan",
    accountRequired: "Gumawa ng account bago magbayad", paymentMethods: "Makikita ang PayPal at card pagkatapos mag-sign in.", choosePlan: "pumili ng buwanang plano sa ibaba.", subscribePaypal: "Mag-subscribe gamit ang PayPal", subscribeCard: "Mag-subscribe gamit ang card",
  },
};
