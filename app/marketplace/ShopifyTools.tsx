"use client";
import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  PackageCheck,
  ShoppingBag,
  ShoppingCart,
} from "lucide-react";

function digits(v: string) {
  return v.replace(/\D/g, "");
}
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {}
  }
  return (
    <button
      disabled={!text}
      onClick={copy}
      className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-700 px-4 py-2 text-sm text-white disabled:opacity-40"
    >
      {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}
function Result({ text, phone }: { text: string; phone: string }) {
  const href = `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`;
  return (
    <div className="mt-4 rounded-2xl bg-[#0b141a] p-4">
      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
        {text || "Your prepared message will appear here."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <CopyButton text={text} />
        <a
          href={text && phone ? href : undefined}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-bold text-black ${!text || !phone ? "pointer-events-none opacity-40" : ""}`}
        >
          <ExternalLink className="h-4 w-4" />
          Open WhatsApp
        </a>
      </div>
    </div>
  );
}
export default function ShopifyTools() {
  const [phone, setPhone] = useState("");
  const [product, setProduct] = useState("");
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  const [customer, setCustomer] = useState("");
  const [discount, setDiscount] = useState("");
  const [order, setOrder] = useState("");
  const [status, setStatus] = useState("shipped");
  const productText = useMemo(
    () =>
      product
        ? `Hi! I’m interested in ${product}${price ? ` (${price})` : ""}.${url ? `\nProduct: ${url}` : ""}\nIs it available?`
        : "",
    [product, price, url],
  );
  const recovery = useMemo(
    () =>
      customer
        ? `Hi ${customer}, you left something in your cart${discount ? `. Use ${discount} when you’re ready to complete your order` : ""}. Would you like help with sizing, delivery or checkout?`
        : "",
    [customer, discount],
  );
  const update = useMemo(
    () =>
      order
        ? `Hi${customer ? ` ${customer}` : ""}, your Shopify order ${order} is now ${status}. Reply here if you need any help with your delivery.`
        : "",
    [order, status, customer],
  );
  return (
    <section id="shopify-tools" className="mt-16 scroll-mt-24">
        <div className="text-center">
          <p className="text-sm font-semibold text-[#25D366]">
            Official Wazap marketplace collection
          </p>
          <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">
            WhatsApp tools for Shopify merchants
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-slate-400">
            Prepare product inquiries, cart-recovery messages and order updates
            without connecting or exposing your store credentials. Review every
            message before sending.
          </p>
        </div>
        <div className="mx-auto mt-8 max-w-xl">
          <label className="text-sm font-medium text-white">
            Your WhatsApp business number
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Country code + number"
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"
          />
        </div>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          <section className="rounded-3xl border border-slate-800 bg-[#111811] p-5">
            <ShoppingBag className="text-[#25D366]" />
            <h2 className="mt-3 text-xl font-bold text-white">
              Product inquiry link
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a WhatsApp sales link for any Shopify product.
            </p>
            <div className="mt-4 space-y-3">
              <input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="Product name"
                className="w-full rounded-xl bg-slate-950 p-3 text-white"
              />
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Price (optional)"
                className="w-full rounded-xl bg-slate-950 p-3 text-white"
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Shopify product URL"
                className="w-full rounded-xl bg-slate-950 p-3 text-white"
              />
            </div>
            <Result text={productText} phone={phone} />
          </section>
          <section className="rounded-3xl border border-slate-800 bg-[#111811] p-5">
            <ShoppingCart className="text-[#25D366]" />
            <h2 className="mt-3 text-xl font-bold text-white">
              Cart recovery message
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Follow up personally without bulk sending or spam.
            </p>
            <div className="mt-4 space-y-3">
              <input
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Customer first name"
                className="w-full rounded-xl bg-slate-950 p-3 text-white"
              />
              <input
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="Discount code (optional)"
                className="w-full rounded-xl bg-slate-950 p-3 text-white"
              />
            </div>
            <Result text={recovery} phone={phone} />
          </section>
          <section className="rounded-3xl border border-slate-800 bg-[#111811] p-5">
            <PackageCheck className="text-[#25D366]" />
            <h2 className="mt-3 text-xl font-bold text-white">
              Order status update
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a clear update customers can reply to.
            </p>
            <div className="mt-4 space-y-3">
              <input
                value={order}
                onChange={(e) => setOrder(e.target.value)}
                placeholder="Order number"
                className="w-full rounded-xl bg-slate-950 p-3 text-white"
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl bg-slate-950 p-3 text-white"
              >
                <option>confirmed</option>
                <option>being prepared</option>
                <option>shipped</option>
                <option>out for delivery</option>
                <option>delivered</option>
                <option>delayed</option>
              </select>
            </div>
            <Result text={update} phone={phone} />
          </section>
        </div>
        <div className="mt-10 rounded-3xl border border-amber-400/20 bg-amber-400/5 p-6 text-center">
          <h2 className="text-xl font-bold text-white">
            Want automatic Shopify sync?
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400">
            Official store connection is being prepared through Shopify OAuth,
            scoped permissions and verified webhooks. These tools work now
            without credentials.
          </p>
          <p className="mt-3 text-xs text-amber-200/80">
            Automatic connections will be listed here only after permission,
            privacy and webhook review.
          </p>
        </div>
    </section>
  );
}
