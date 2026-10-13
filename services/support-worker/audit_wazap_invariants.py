#!/usr/bin/env python3
import argparse
import json
import re
from pathlib import Path


def read(root: Path, relative: str) -> str:
    path = root / relative
    return path.read_text(encoding="utf-8") if path.exists() else ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit Wazap cross-system launch invariants")
    parser.add_argument("project", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    root = args.project.resolve()

    billing = read(root, "lib/billing.ts")
    prices_match = re.search(r"PLAN_PRICES[^=]*=\s*\{(.*?)\}", billing, re.S)
    prices = dict(re.findall(r"(basic|pro|ultimate|business)\s*:\s*(\d+)", prices_match.group(1) if prices_match else ""))
    paid_plans = list(prices)

    files = {
        "paypal": read(root, "lib/paypal.ts"),
        "dodo": read(root, "app/api/payment/dodo/create/route.ts"),
        "pricing": read(root, "app/pricing/PricingPlans.tsx"),
        "billing": billing,
        "auth": read(root, "lib/auth.ts"),
        "dashboard": read(root, "app/dashboard/page.tsx"),
        "upgrade": read(root, "app/dashboard/UpgradeSuccessBanner.tsx"),
        "activate": read(root, "app/api/admin/activate/route.ts"),
        "paypal_create": read(root, "app/api/payment/paypal/create/route.ts"),
        "dodo_create": read(root, "app/api/payment/dodo/create/route.ts"),
        "paypal_webhook": read(root, "app/api/payment/paypal/webhook/route.ts"),
        "dodo_webhook": read(root, "app/api/payment/dodo/webhook/route.ts"),
        "email": read(root, "lib/email.ts"),
        "contact_reply": read(root, "app/api/admin/contact-reply/route.ts"),
        "package": read(root, "package.json"),
    }

    checks = []

    def check(name: str, ok: bool, detail: str):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    check("paid plans discovered", bool(paid_plans), f"plans={paid_plans}")
    for plan in paid_plans:
        upper = plan.upper()
        check(f"{plan}: PayPal mapping", f"PAYPAL_PLAN_ID_{upper}" in files["paypal"], "provider plan must map to Wazap plan")
        check(f"{plan}: Dodo mapping", f"DODO_PRODUCT_ID_{upper}" in files["dodo"], "provider product must map to Wazap plan")
        check(f"{plan}: pricing card", f'id: "{plan}"' in files["pricing"], f"site price={prices[plan]}")
        check(f"{plan}: expiry support", plan in files["billing"], "plan must activate and renew")
        check(f"{plan}: dashboard label", plan in files["dashboard"], "customer must see correct plan")
        check(f"{plan}: admin activation", plan in files["activate"], "admin controls must support plan")

    check("PayPal checkout observability", all(token in files["paypal_create"] for token in ["checkout_started", "payment_failed"]), "record start and provider creation failure")
    check("Dodo checkout observability", all(token in files["dodo_create"] for token in ["checkout_started", "payment_failed", "prisma.payment.create"]), "record pending checkout and failure")
    check("PayPal webhook activation", "PLAN_PRICES" in files["paypal_webhook"] and "getPlanFromPayPalPlanId" in files["paypal_webhook"], "map provider confirmation to entitlement")
    check("Dodo webhook activation", "PLAN_PRICES" in files["dodo_webhook"] and "planExpiry" in files["dodo_webhook"], "map provider confirmation to entitlement")
    check("support reply email", all(token in files["contact_reply"] for token in ["outboundEmail", "sendEmail", "emailSent"]), "dashboard reply must notify customer and expose result")
    check("support email template", "renderSupportReplyEmail" in files["email"], "branded notification template required")
    check("static permission safeguard", "postbuild" in files["package"] and "chmod 755" in files["package"] and "chmod 644" in files["package"], "Nginx must read Next.js assets after every build")

    env_path = root / ".env"
    if env_path.exists():
        env_names = {line.split("=", 1)[0] for line in env_path.read_text(encoding="utf-8").splitlines() if "=" in line and not line.lstrip().startswith("#")}
        for plan in paid_plans:
            upper = plan.upper()
            check(f"{plan}: PayPal env", f"PAYPAL_PLAN_ID_{upper}" in env_names, "configured without revealing value")
            check(f"{plan}: Dodo env", f"DODO_PRODUCT_ID_{upper}" in env_names, "configured without revealing value")

    failures = [item for item in checks if not item["ok"]]
    result = {"project": str(root), "plans": prices, "passed": len(checks) - len(failures), "failed": len(failures), "checks": checks}
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for item in checks:
            print(f"{'PASS' if item['ok'] else 'FAIL'}  {item['name']}: {item['detail']}")
        print(f"\n{result['passed']} passed, {result['failed']} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
