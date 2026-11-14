export default function Footer() {
  return (
    <footer className="mt-16 bg-brand-dark text-sm text-gray-300">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 md:grid-cols-3">
        <div>
          <p className="text-lg font-bold text-white">
            Stride<span className="text-accent">LK</span>
          </p>
          <p className="mt-2 text-gray-300">Shoes for every step, delivered island-wide.</p>
        </div>
        <div>
          <p className="font-semibold text-white">Customer Promise</p>
          <p className="mt-2 text-gray-300">
            Cash on delivery · 1–3 day delivery across all 25 districts · SwiftDrop live tracking
          </p>
        </div>
        <div>
          <p className="font-semibold text-white">SwiftDrop Integration Demo</p>
          <p className="mt-2 text-gray-300">
            Enterprise store integrated with SwiftDrop ERP courier logistics engine.
          </p>
        </div>
      </div>
    </footer>
  );
}

