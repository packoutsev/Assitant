import os, csv, re
from collections import Counter

CUSTOMER_DIR = r"C:\Users\matth\Downloads\Customer Records"
OUTPUT_CSV = r"C:\Users\matth\Downloads\Spreadsheets\customer_paired_data_index.csv"

def classify_file(filename):
    fn = filename.lower()
    results = []
    if "cartage labor process calculator" in fn:
        if fn.endswith(".xlsx"): results.append("cartage_calculator_xlsx")
        elif fn.endswith(".pdf"): results.append("cartage_calculator_pdf")
        return results
    if any(p in fn for p in ["walk through","walk-through","walkthrough","initial walk","walk_through","walk photo"]) and fn.endswith(".pdf"):
        results.append("encircle_walkthrough")
    if fn.endswith(".pdf"):
        if "encircle" in fn and "packout" in fn: results.append("encircle_packout")
        elif "final packout report" in fn: results.append("encircle_packout")
        elif "final_packout_report" in fn: results.append("encircle_packout")
        elif "packout report" in fn and "estimate" not in fn: results.append("encircle_packout")
    if fn.endswith(".pdf") and ("cleaning photo report" in fn or "clean photo report" in fn or "clean_boxed_photos" in fn or "revised_cleaning_estimate_report" in fn):
        results.append("encircle_cleaning")
    if fn.endswith(".pdf") and "packback" in fn and "report" in fn:
        results.append("encircle_packback")
    if fn.endswith(".pdf") and "encircle report" in fn and not results:
        results.append("encircle_walkthrough")
    if fn.endswith(".pdf") and "phase" in fn and "report" in fn and "encircle_packout" not in results:
        results.append("encircle_packout")
    if fn.endswith(".pdf") and "encircle" in fn and "contents" in fn and "encircle_walkthrough" not in results:
        results.append("encircle_walkthrough")
    if fn.endswith(".pdf") and "final_packout_tl_report" in fn.replace(" ","_") and "encircle_packout" not in results:
        results.append("encircle_packout")
    if results: return results
    if not fn.endswith(".pdf"): return results
    skip = ["invoice","payment","receipt","label","tag label","map screenshot","auth"," log","roca ","tcs ","fosters","referral","proposal","cos.pdf","certificate","floor plan","qb ","comp.pdf","comperative","comparative","vault","dumpster","piano","safe &","safe and","hot shot","movers","accuserve","delivery","irespond","disposal","charm","gryphon","yellow jacket","yj-respond","lyons","missing items","time sheet","time log","box label","servicemaster","outsour","ehs ","load out","signed cos","draft - ","project proposal","work auth","driving log","labor log","scope","replacement","total loss - non","report.pdf","index.pdf","intake","additional scope","email","clock","screen","phase outline","gus-s-residence","blank work"]
    if any(s in fn for s in skip): return results
    is_est = "estimate" in fn or "estima" in fn
    is_fin = "final" in fn
    is_cln = "clean" in fn
    is_pb = any(x in fn for x in ["packback","takeback","takback","take back","_pb_","_tb_"])
    is_sto = "storage" in fn
    is_elec = "electronic" in fn
    is_dft = "draft" in fn
    has_xact = bool(re.search(r"[A-Z]{3,}_", filename)) or is_est or is_fin
    if not has_xact: return results
    if is_cln and is_fin: results.append("xactimate_cleaning_final")
    elif is_cln and is_est: results.append("xactimate_cleaning_estimate")
    elif is_cln: results.append("xactimate_cleaning")
    elif is_pb and is_fin: results.append("xactimate_packback_final")
    elif is_pb and is_est: results.append("xactimate_packback_estimate")
    elif is_pb: results.append("xactimate_packback")
    elif is_sto and is_fin: results.append("xactimate_storage_final")
    elif is_sto: results.append("xactimate_storage")
    elif is_elec and is_fin: results.append("xactimate_electronics_final")
    elif is_elec and is_est: results.append("xactimate_electronics_estimate")
    elif is_elec: results.append("xactimate_electronics")
    elif is_fin and not is_est: results.append("xactimate_final")
    elif is_est and not is_fin: results.append("xactimate_estimate")
    elif is_est and is_fin: results.append("xactimate_final")
    elif is_dft: results.append("xactimate_draft")
    else: results.append("xactimate_other")
    return results

rows = []
for cname in sorted(os.listdir(CUSTOMER_DIR)):
    fpath = os.path.join(CUSTOMER_DIR, cname)
    if not os.path.isdir(fpath): continue
    for root, dirs, files in os.walk(fpath):
        for fn in files:
            fp = os.path.join(root, fn)
            for ft in classify_file(fn):
                rows.append({"customer_name":cname,"folder_path":fpath,"file_type":ft,"file_path":fp,"file_name":fn})

with open(OUTPUT_CSV,"w",newline="",encoding="utf-8") as f:
    w = csv.DictWriter(f,fieldnames=["customer_name","folder_path","file_type","file_path","file_name"])
    w.writeheader()
    w.writerows(rows)
print(f"Wrote {len(rows)} records to {OUTPUT_CSV}")
tc = Counter(r["file_type"] for r in rows)
ct = {}
for r in rows: ct.setdefault(r["customer_name"],set()).add(r["file_type"])
print("\n=== FILE TYPE COUNTS ===")
for ft,c in sorted(tc.items()): print(f"  {ft}: {c}")
print(f"\nTotal customers with classified files: {len(ct)}")
paired = [(c,t) for c,t in sorted(ct.items()) if any(x.startswith("encircle_") for x in t) and any(x.startswith("xactimate_") for x in t)]
print(f"\nCustomers with BOTH Encircle + Xactimate: {len(paired)}")
for c,t in paired: print(f"  {c}: {', '.join(sorted(t))}")
eo = sorted(c for c,t in ct.items() if any(x.startswith("encircle_") for x in t) and not any(x.startswith("xactimate_") for x in t))
xo = sorted(c for c,t in ct.items() if any(x.startswith("xactimate_") for x in t) and not any(x.startswith("encircle_") for x in t))
print(f"\nEncircle ONLY: {len(eo)}")
for c in eo: print(f"  {c}")
print(f"\nXactimate ONLY: {len(xo)}")
for c in xo: print(f"  {c}")
cc = [c for c,t in ct.items() if any(x.startswith("cartage_") for x in t)]
print(f"\nCartage Calculator customers: {len(cc)}")
ac = set(c for c in os.listdir(CUSTOMER_DIR) if os.path.isdir(os.path.join(CUSTOMER_DIR,c)))
uc = sorted(ac - set(ct.keys()))
print(f"\nNo classified files: {len(uc)}")
for c in uc: print(f"  {c}")
