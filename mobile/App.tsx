import { StatusBar } from "expo-status-bar";
import { useState, useEffect, useCallback } from "react";
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  ScrollView, Linking, Platform, KeyboardAvoidingView,
  Alert, Pressable,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#25D366";
const BG = "#0a0f0a";
const CARD = "#111811";
const BORDER = "#1e3a1e";
const MUTED = "#475569";

const COUNTRIES = [
  { dial: "971", name: "🇦🇪 +971 UAE" },
  { dial: "966", name: "🇸🇦 +966 Saudi Arabia" },
  { dial: "44",  name: "🇬🇧 +44 UK" },
  { dial: "1",   name: "🇺🇸 +1 USA" },
  { dial: "91",  name: "🇮🇳 +91 India" },
  { dial: "20",  name: "🇪🇬 +20 Egypt" },
  { dial: "92",  name: "🇵🇰 +92 Pakistan" },
  { dial: "63",  name: "🇵🇭 +63 Philippines" },
  { dial: "234", name: "🇳🇬 +234 Nigeria" },
  { dial: "974", name: "🇶🇦 +974 Qatar" },
  { dial: "965", name: "🇰🇼 +965 Kuwait" },
  { dial: "973", name: "🇧🇭 +973 Bahrain" },
  { dial: "968", name: "🇴🇲 +968 Oman" },
  { dial: "49",  name: "🇩🇪 +49 Germany" },
  { dial: "33",  name: "🇫🇷 +33 France" },
  { dial: "55",  name: "🇧🇷 +55 Brazil" },
  { dial: "62",  name: "🇮🇩 +62 Indonesia" },
];

interface Recent { dial: string; number: string; message: string; ts: number; }

function Screen({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
  const [dial, setDial] = useState("971");
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const [recent, setRecent] = useState<Recent[]>([]);
  const [showCountry, setShowCountry] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("wazap_recent").then(v => {
      if (v) setRecent(JSON.parse(v));
    });
    AsyncStorage.getItem("wazap_dial").then(v => {
      if (v) setDial(v);
    });
  }, []);

  const selectedCountry = COUNTRIES.find(c => c.dial === dial) ?? COUNTRIES[0];

  function saveRecent(d: string, n: string, m: string) {
    const entry: Recent = { dial: d, number: n, message: m, ts: Date.now() };
    const filtered = recent.filter(r => !(r.dial === d && r.number === n));
    const updated = [entry, ...filtered].slice(0, 10);
    setRecent(updated);
    AsyncStorage.setItem("wazap_recent", JSON.stringify(updated));
  }

  function openWhatsApp(d: string, n: string, m: string) {
    const clean = n.replace(/\D/g, "");
    if (!clean) { Alert.alert("Enter a phone number"); return; }
    const full = d + clean;
    const url = m.trim()
      ? `https://wa.me/${full}?text=${encodeURIComponent(m.trim())}`
      : `https://wa.me/${full}`;
    Linking.openURL(url).catch(() => Alert.alert("WhatsApp not installed"));
    saveRecent(d, clean, m.trim());
    AsyncStorage.setItem("wazap_dial", d);
  }

  function handleOpen() {
    openWhatsApp(dial, number, message);
  }

  if (tab === "history") {
    return (
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>Recent Numbers</Text>
        {recent.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>No recent chats yet</Text>
            <Text style={styles.emptyHint}>Numbers you message will appear here</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {recent.map((r, i) => (
              <TouchableOpacity key={i} style={styles.recentItem} onPress={() => openWhatsApp(r.dial, r.number, r.message)}>
                <View style={styles.recentLeft}>
                  <Text style={styles.recentNumber}>+{r.dial} {r.number}</Text>
                  {r.message ? <Text style={styles.recentMsg} numberOfLines={1}>{r.message}</Text> : null}
                </View>
                <Text style={styles.recentOpen}>Open ↗</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.clearBtn} onPress={() => {
              setRecent([]);
              AsyncStorage.removeItem("wazap_recent");
            }}>
              <Text style={styles.clearText}>Clear history</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    );
  }

  if (tab === "more") {
    return (
      <ScrollView style={styles.flex} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>More</Text>
        {[
          { label: "Full features & plans", sub: "Subscriptions, QR generator, unlimited", url: "https://wazap.lt" },
          { label: "QR Code Generator", sub: "Generate a QR for your WhatsApp number", url: "https://wazap.lt/qr" },
          { label: "Pricing", sub: "Basic, Pro and Ultimate plans", url: "https://wazap.lt/pricing" },
          { label: "My Account", sub: "Dashboard, usage, and billing", url: "https://wazap.lt/dashboard" },
        ].map((item, i) => (
          <TouchableOpacity key={i} style={styles.moreItem} onPress={() => Linking.openURL(item.url)}>
            <View style={styles.flex}>
              <Text style={styles.moreLabel}>{item.label}</Text>
              <Text style={styles.moreSub}>{item.sub}</Text>
            </View>
            <Text style={styles.moreArrow}>→</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.accountCard}>
          <Text style={styles.accountTitle}>Manage Wazap</Text>
          <Text style={styles.accountBody}>Open your dashboard to review usage, billing, saved tools, and account settings.</Text>
          <TouchableOpacity style={styles.accountBtn} onPress={() => Linking.openURL("https://wazap.lt/dashboard")}>
            <Text style={styles.accountBtnText}>Open Dashboard</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerNote}>© 2026 Wazap.lt — Not affiliated with WhatsApp or Meta</Text>
      </ScrollView>
    );
  }

  // Main send screen
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Country picker */}
        <Text style={styles.label}>Country</Text>
        <TouchableOpacity style={styles.input} onPress={() => setShowCountry(!showCountry)}>
          <Text style={styles.inputText}>{selectedCountry.name}</Text>
          <Text style={styles.muted}>{showCountry ? "▲" : "▼"}</Text>
        </TouchableOpacity>

        {showCountry && (
          <ScrollView style={styles.dropdown} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {COUNTRIES.map(c => (
              <TouchableOpacity key={c.dial} style={styles.dropdownItem} onPress={() => {
                setDial(c.dial);
                setShowCountry(false);
                AsyncStorage.setItem("wazap_dial", c.dial);
              }}>
                <Text style={[styles.dropdownText, c.dial === dial && styles.dropdownActive]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Phone number */}
        <Text style={[styles.label, { marginTop: 14 }]}>Phone Number</Text>
        <TextInput
          style={styles.input}
          value={number}
          onChangeText={setNumber}
          placeholder="Enter phone number"
          placeholderTextColor={MUTED}
          keyboardType="phone-pad"
          returnKeyType="done"
        />

        {/* Message */}
        <Text style={[styles.label, { marginTop: 14 }]}>Message (optional)</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={message}
          onChangeText={setMessage}
          placeholder="Hi! I'd like to get in touch..."
          placeholderTextColor={MUTED}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Open button */}
        <TouchableOpacity
          style={[styles.openBtn, !number.replace(/\D/g, "") && styles.openBtnDisabled]}
          onPress={handleOpen}
          disabled={!number.replace(/\D/g, "")}
        >
          <Text style={styles.openBtnText}>💬  Open WhatsApp</Text>
        </TouchableOpacity>

        {/* Recent */}
        {recent.length > 0 && (
          <>
            <Text style={[styles.label, { marginTop: 22 }]}>Recent</Text>
            {recent.slice(0, 3).map((r, i) => (
              <TouchableOpacity key={i} style={styles.recentItem} onPress={() => openWhatsApp(r.dial, r.number, r.message)}>
                <Text style={styles.recentNumber}>+{r.dial} {r.number}</Text>
                <Text style={styles.recentOpen}>Open ↗</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function App() {
  const [tab, setTab] = useState("send");

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" backgroundColor={BG} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoEmoji}>⚡</Text>
            </View>
            <Text style={styles.logoText}>Wazap</Text>
          </View>
          <Text style={styles.headerSub}>No saving needed</Text>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Screen tab={tab} setTab={setTab} />
        </View>

        {/* Bottom nav */}
        <View style={styles.bottomNav}>
          {[
            { id: "send", label: "Send", icon: "💬" },
            { id: "history", label: "History", icon: "🕐" },
            { id: "more", label: "More", icon: "⚙️" },
          ].map(t => (
            <TouchableOpacity key={t.id} style={styles.navItem} onPress={() => setTab(t.id)}>
              <Text style={styles.navIcon}>{t.icon}</Text>
              <Text style={[styles.navLabel, tab === t.id && styles.navLabelActive]}>{t.label}</Text>
              {tab === t.id && <View style={styles.navDot} />}
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  flex: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: GREEN, alignItems: "center", justifyContent: "center",
  },
  logoEmoji: { fontSize: 18 },
  logoText: { fontSize: 20, fontWeight: "800", color: GREEN },
  headerSub: { fontSize: 12, color: MUTED },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  label: { fontSize: 12, color: MUTED, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
    color: "#e2e8f0", fontSize: 15, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between",
  },
  inputText: { color: "#e2e8f0", fontSize: 15 },
  muted: { color: MUTED, fontSize: 13 },
  textarea: { height: 90, alignItems: "flex-start" },
  dropdown: {
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    borderRadius: 14, maxHeight: 220, marginBottom: 4,
  },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#1e2d1e" },
  dropdownText: { color: "#cbd5e1", fontSize: 14 },
  dropdownActive: { color: GREEN, fontWeight: "700" },
  openBtn: {
    backgroundColor: GREEN, borderRadius: 999,
    paddingVertical: 16, alignItems: "center", marginTop: 20,
  },
  openBtnDisabled: { opacity: 0.4 },
  openBtnText: { color: "#000", fontWeight: "800", fontSize: 16 },
  recentItem: {
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8,
  },
  recentLeft: { flex: 1 },
  recentNumber: { color: "#cbd5e1", fontSize: 14, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  recentMsg: { color: MUTED, fontSize: 12, marginTop: 2 },
  recentOpen: { color: GREEN, fontSize: 13, fontWeight: "700" },
  clearBtn: { alignItems: "center", paddingVertical: 14 },
  clearText: { color: MUTED, fontSize: 13 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#fff", marginBottom: 16 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: "#e2e8f0", fontSize: 16, fontWeight: "600" },
  emptyHint: { color: MUTED, fontSize: 13, marginTop: 6 },
  moreItem: {
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", marginBottom: 10,
  },
  moreLabel: { color: "#e2e8f0", fontSize: 15, fontWeight: "600" },
  moreSub: { color: MUTED, fontSize: 12, marginTop: 2 },
  moreArrow: { color: GREEN, fontSize: 18, fontWeight: "700" },
  accountCard: {
    backgroundColor: "#0d1f0d", borderWidth: 1, borderColor: GREEN + "40",
    borderRadius: 16, padding: 18, marginTop: 6, marginBottom: 10,
  },
  accountTitle: { color: "#fff", fontSize: 15, fontWeight: "700", marginBottom: 8 },
  accountBody: { color: MUTED, fontSize: 13, lineHeight: 20, marginBottom: 14 },
  accountBtn: { backgroundColor: GREEN, borderRadius: 999, paddingVertical: 12, alignItems: "center" },
  accountBtnText: { color: "#000", fontWeight: "700", fontSize: 14 },
  footerNote: { color: "#1e293b", fontSize: 11, textAlign: "center", marginTop: 10, marginBottom: 30 },
  bottomNav: {
    flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER,
    backgroundColor: BG, paddingBottom: Platform.OS === "ios" ? 0 : 8,
  },
  navItem: { flex: 1, alignItems: "center", paddingVertical: 10 },
  navIcon: { fontSize: 20 },
  navLabel: { color: MUTED, fontSize: 11, marginTop: 3 },
  navLabelActive: { color: GREEN, fontWeight: "700" },
  navDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: GREEN, marginTop: 3 },
});
