#!/usr/bin/env python3
"""
Test de bout en bout : vrai Chromium + extension chargée + page piège.
Usage : python3 tests/e2e_extension.py [--shots DOSSIER]
Vérifie : surlignage, exclusions (input/textarea/script), contenu dynamique, bulle, modale
(preuve, sources, statut), titre accentué, lien cliquable, Échap, isolation CSS (Shadow DOM),
désactivation/réactivation, mode "une seule fois", stabilité (pas de boucle de mutations),
et l'absence d'injection HTML depuis des données piégées.
"""
import json, sys, tempfile, threading, time, http.server, socketserver, functools
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / "tests" / "fixtures"
PORT = 4797
SHOTS = Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
results = []

def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("  ✓ " if cond else "  ✗ ") + name + (f"  [{detail}]" if detail and not cond else ""))

def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(FIX))
    handler.log_message = lambda *a, **k: None
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

def launch(p, user_dir):
    return p.chromium.launch_persistent_context(user_dir, channel="chromium", headless=True, args=[
        f"--disable-extensions-except={ROOT}", f"--load-extension={ROOT}", "--headless=new"])

def sw_of(ctx):
    return ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)

def tab_msg(sw, msg):
    return sw.evaluate("async (m) => { const [t] = await chrome.tabs.query({active:true}); "
                       "return chrome.tabs.sendMessage(t.id, m); }", msg)

def main():
    srv = serve()
    url = f"http://127.0.0.1:{PORT}/article.html"
    with sync_playwright() as p:
        # ── 1. données réelles (bundle) ───────────────────────────────────────
        ctx = launch(p, tempfile.mkdtemp()); sw = sw_of(ctx)
        ctx.route("https://raw.githubusercontent.com/**", lambda r: r.abort())   # force le repli sur le bundle
        page = ctx.new_page(); page.goto(url); page.wait_for_selector(".casseroles-rough-highlight", timeout=10000)
        hl = page.locator(".casseroles-rough-highlight")
        texts = [t.strip() for t in hl.all_inner_texts()]
        print("\n[surlignage]", texts)
        check("noms surlignés dans <p> et <a>", sum("Quatennens" in t for t in texts) >= 2)
        check("ÉLISABETH BORNE surligné (casse + accent)", any(t.upper().replace("É", "E") == "ELISABETH BORNE" for t in texts))
        check("rien dans input/textarea/script", page.locator("input .casseroles-rough-highlight, textarea .casseroles-rough-highlight, script .casseroles-rough-highlight").count() == 0)
        check("pas de faux positif (Quatennensesque / anti-Elisabeth)", not any(t == "Quatennensesque" for t in texts))
        page.wait_for_selector("#p3 .casseroles-rough-highlight", timeout=6000)
        check("contenu ajouté après coup surligné (observer)", True)
        n1 = hl.count(); time.sleep(1.5); check("stable : pas de boucle de mutations", page.locator(".casseroles-rough-highlight").count() == n1)

        # ── 2. bulle puis modale ──────────────────────────────────────────────
        first = page.locator("#p1 .casseroles-rough-highlight").first
        first.hover(); page.wait_for_selector("#casseroles-float-bubble", state="visible", timeout=3000)
        check("bulle « ticket » au survol (dans le Shadow DOM)", "🧾" in page.locator("#casseroles-float-bubble .stub").text_content())
        first.click(); page.wait_for_selector("#casseroles-modal", state="visible", timeout=3000); time.sleep(0.5)
        modal = page.locator("#casseroles-modal"); mt = modal.inner_text(); mtl = mt.lower()
        print("\n[modale Quatennens]\n" + mt[:600].replace("\n", " | "))
        check("nom en titre", "adrien quatennens" in mtl)
        check("statut juridique prudent affiché", "condamné" in mtl and "non établi" in mtl)
        check("tag de statut sobre (aucune blague sur le verdict)", modal.locator(".tag.conv").first.text_content().strip() == "Condamné · caractère définitif non établi")
        check("badge ✓ Vérifié", "vérifié" in mtl)
        check("preuve citée dépliable", modal.locator("details.proof").count() >= 1)
        check("sources en liens https", modal.locator(".src a[href^='https://']").count() >= 1)
        check("humour (note du serveur) absent d'un dossier judiciaire", "note du serveur" not in mtl)
        font = modal.locator(".who").evaluate("e => getComputedStyle(e).fontFamily")
        check("isolation CSS : police du site hostile absente de la modale", "Comic" not in font, font)
        spacing = modal.locator(".txt").first.evaluate("e => getComputedStyle(e).letterSpacing")
        check("isolation CSS : letter-spacing hostile non hérité", spacing in ("normal", "0px"), spacing)
        color = modal.locator(".who").evaluate("e => getComputedStyle(e).color")
        check("isolation CSS : couleur hostile non héritée", "0, 255, 0" not in color, color)
        loaded = page.evaluate("[...document.fonts].filter(f => f.family.includes('Casseroles') && f.status === 'loaded').map(f => f.family + ' ' + f.weight)")
        check("polices embarquées réellement chargées (pas de requête vers le site)", len(loaded) >= 1, str(loaded))
        if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True); page.screenshot(path=str(SHOTS / "modale-quatennens.png"))
        page.keyboard.press("Escape"); time.sleep(0.5)
        check("Échap ferme la modale", not modal.is_visible())

        # ── 3. accents du titre + lien cliquable ──────────────────────────────
        page.locator("#p1 .casseroles-rough-highlight").nth(1).click(); page.wait_for_selector("#casseroles-modal", state="visible")
        check("titre accentué correct (pas « ÉLisabeth »)", "Élisabeth Borne" == modal.locator(".who").text_content())
        bt = modal.inner_text().lower()
        check("mode drôle : pied de ticket + TVA + note du serveur", "prescrit" in bt and "tva" in bt and "note du serveur" in bt, bt[-300:])
        page.keyboard.press("Escape"); time.sleep(0.4)
        tab_msg(sw, {"action": "setHumor", "humor": "serious"})
        page.locator("#p1 .casseroles-rough-highlight").nth(1).click(); page.wait_for_selector("#casseroles-modal", state="visible"); time.sleep(0.7)
        st = modal.inner_text().lower()
        check("mode sérieux : aucune blague (prescrit / TVA / note du serveur)", not any(w in st for w in ("prescrit", "tva", "note du serveur")))
        check("mode sérieux : mêmes faits (nom + décompte)", "élisabeth borne" in st and "affaires documentées" in st)
        page.keyboard.press("Escape"); time.sleep(0.4)
        tab_msg(sw, {"action": "setHumor", "humor": "funny"})
        page.locator("#lnk .casseroles-rough-highlight").click(); time.sleep(0.4)
        check("nom dans un lien : le lien fonctionne (navigation)", page.evaluate("location.hash") == "#cible")
        check("… et la modale ne s'ouvre pas", not modal.is_visible())

        # ── 4. on/off + mode une seule fois ───────────────────────────────────
        tab_msg(sw, {"action": "toggle", "enabled": False}); time.sleep(0.5)
        check("désactivation : plus de surlignage", page.locator(".casseroles-rough-highlight").count() == 0)
        tab_msg(sw, {"action": "toggle", "enabled": True}); time.sleep(0.8)
        check("réactivation : surlignage revenu", page.locator(".casseroles-rough-highlight").count() >= 3)
        tab_msg(sw, {"action": "setFirstOnly", "firstOnly": True}); time.sleep(0.8)
        names = [t.strip().lower().replace("é", "e") for t in page.locator(".casseroles-rough-highlight").all_inner_texts()]
        check("mode « une seule fois » : 1 surlignage par personne", len(names) == len(set(names)), str(names))
        tab_msg(sw, {"action": "setFirstOnly", "firstOnly": False})
        stats = tab_msg(sw, {"action": "getStats"})
        check("getStats cohérent", stats and stats["count"] >= 3 and stats["total"] > 100, str(stats))
        ctx.close()

        # ── 5. données piégées : aucune injection ────────────────────────────
        ctx = launch(p, tempfile.mkdtemp()); sw = sw_of(ctx)
        evil = '<img src=x onerror="window.__xss=1">'
        bad = {"_meta": {"schema": 3}, "adrien quatennens": {"role": evil, "party": evil, "satirical_comment": evil, "casseroles_count": 1,
               "timeline": [{"year": "2022", "type": "polémique", "status": "polemique", "title": evil, "verification": "unverified",
                             "sources": [{"url": "javascript:window.__xss=1", "outlet": evil}], "evidence": evil}]}}
        sw.evaluate("async (d) => chrome.storage.local.set({encyclopediaData: d, encyclopediaCachedAt: Date.now()})", bad)
        page = ctx.new_page(); page.goto(url); page.wait_for_selector(".casseroles-rough-highlight", timeout=10000)
        page.locator("#p1 .casseroles-rough-highlight").first.click(); page.wait_for_selector("#casseroles-modal", state="visible"); time.sleep(0.5)
        check("XSS : aucun <img> injecté dans la modale", page.locator("#casseroles-modal img[src='x']").count() == 0)
        check("XSS : aucun script exécuté dans la page", page.evaluate("window.__xss") is None)
        check("XSS : lien javascript: non rendu", page.locator("#casseroles-modal a[href^='javascript']").count() == 0)
        ctx.close()

        # ── 6. extension rechargée : l'onglet déjà ouvert garde un script ORPHELIN (bug vu sur localhost:4800) ──
        ctx = launch(p, tempfile.mkdtemp()); sw = sw_of(ctx)
        ctx.route("https://raw.githubusercontent.com/**", lambda r: r.abort())
        errs = []
        page = ctx.new_page(); page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(url); page.wait_for_selector(".casseroles-rough-highlight", timeout=10000)
        page.locator("#p1 .casseroles-rough-highlight").first.click(); page.wait_for_selector("#casseroles-modal", state="visible")
        try: sw.evaluate("chrome.runtime.reload()")
        except Exception: pass
        time.sleep(2.5)
        page.evaluate("document.body.insertAdjacentHTML('beforeend','<p>Encore Adrien Quatennens.</p>')"); time.sleep(1.5)
        check("rechargement : aucune erreur (Extension context invalidated, null…)", not errs, str(errs))
        check("rechargement : surlignages orphelins retirés", page.locator(".casseroles-rough-highlight").count() == 0)
        check("rechargement : UI orpheline retirée", page.locator("#casseroles-host").count() == 0)
        ctx.close()
    srv.shutdown()
    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} vérifications OK")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
