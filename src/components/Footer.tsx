export default function Footer() {
  return (
    <footer className="mt-16 bg-brand-dark text-sm text-teal-100/90 border-t border-brand">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-4">
        <div>
          <p className="text-xl font-bold text-white tracking-tight">
            Chrono<span className="text-teal-300">LK</span>{" "}
            <span className="text-xs uppercase font-medium tracking-widest text-teal-200/80 ml-1">
              Timepieces
            </span>
          </p>
          <p className="mt-3 text-sm text-teal-100/80 leading-relaxed">
            Curated precision watches, automatic calibers, and luxury chronographs delivered across all 25 districts of Sri Lanka.
          </p>
        </div>
        <div>
          <p className="font-semibold text-white">Collections</p>
          <ul className="mt-3 space-y-1.5 text-teal-100/80">
            <li><a href="/category/automatic" className="hover:text-white">Automatic &amp; Mechanical</a></li>
            <li><a href="/category/chronograph" className="hover:text-white">Chronograph</a></li>
            <li><a href="/category/classic" className="hover:text-white">Classic &amp; Dress</a></li>
            <li><a href="/category/smartwatches" className="hover:text-white">Smartwatches</a></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-white">Customer Promise</p>
          <p className="mt-3 text-sm text-teal-100/80 leading-relaxed">
            Cash on Delivery · Insured 1–3 day delivery · Inspect your timepiece on delivery · Warranty-backed, 100% genuine.
          </p>
        </div>
        <div>
          <p className="font-semibold text-white">SwiftDrop Integration</p>
          <p className="mt-3 text-sm text-teal-100/80 leading-relaxed">
            Enterprise logistics engine with automated booking and live checkpoint tracking.
          </p>
        </div>
      </div>
      <div className="border-t border-[#0B4F4A] py-4 text-center text-xs text-teal-200/60">
        © {new Date().getFullYear()} ChronoLK Timepieces. All rights reserved.
      </div>
    </footer>
  );
}
