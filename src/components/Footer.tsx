export default function Footer() {
  return (
    <footer className="mt-16 bg-brand-dark text-sm text-gray-300">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-3">
        <div>
          <p className="text-xl font-bold text-white tracking-tight">
            Stride<span className="text-accent">LK</span>{" "}
            <span className="text-xs uppercase font-light tracking-widest text-gray-400">
              Timepieces
            </span>
          </p>
          <p className="mt-2 text-gray-300 leading-relaxed">
            Curated precision watches, automatic calibers, and luxury chronographs delivered across Sri Lanka.
          </p>
        </div>
        <div>
          <p className="font-semibold text-white">Customer Promise</p>
          <p className="mt-2 text-gray-300 leading-relaxed">
            Cash on Delivery · Insured 1–3 day delivery across all 25 districts · Inspect before you pay · 100% Genuine guaranteed.
          </p>
        </div>
        <div>
          <p className="font-semibold text-white">SwiftDrop Integration</p>
          <p className="mt-2 text-gray-300 leading-relaxed">
            Automated courier fulfillment & live GPS parcel tracking powered by SwiftDrop logistics engine.
          </p>
        </div>
      </div>
      <div className="border-t border-gray-800 py-4 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} StrideLK Timepieces. All rights reserved.
      </div>
    </footer>
  );
}
