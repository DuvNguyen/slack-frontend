'use client';

import Link from 'next/link';

const siteMap = ['Homepage', 'Technology', 'Ataraxis Ecosystem', 'Resources & News', 'Careers', 'Contact Us', 'Portal'];
const legal = ['Privacy Policy', 'Terms of Service', 'Legal & Cookies'];

export function Footer() {
  return (
    <footer className="mt-20 w-full border-t border-[#3a4646] bg-[#1f2a2a] text-[#eef3f2]">
      <div className="w-full px-4 py-10 md:px-8 xl:px-12">
        <div className="grid w-full gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <p className="text-xl font-extrabold tracking-[0.1em]">△ ATARAXIS</p>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[#d3dedd]">
              Empowering high-stakes work with structured collaboration,
              operational resilience, and focused execution.
            </p>

            <div className="mt-5 flex gap-2 text-xs">
              <span className="border border-[#5c6a6a] px-2 py-1">X</span>
              <span className="border border-[#5c6a6a] px-2 py-1">in</span>
              <span className="border border-[#5c6a6a] px-2 py-1">IG</span>
              <span className="border border-[#5c6a6a] px-2 py-1">YT</span>
            </div>

            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="mt-6 border border-[#5c6a6a] px-4 py-2 text-xs font-semibold tracking-[0.08em] hover:bg-[#2a3838]"
            >
              ↑ BACK TO TOP
            </button>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#dce7e6]">Site Map</p>
            <div className="mt-4 grid gap-2">
              {siteMap.map((item) => (
                <Link key={item} href="/" className="text-sm text-[#eef3f2] hover:underline">
                  {item}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#dce7e6]">Legal</p>
            <div className="mt-4 grid gap-2">
              {legal.map((item) => (
                <Link key={item} href="/" className="text-sm text-[#eef3f2] hover:underline">
                  {item}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full border-t border-[#3a4646] px-4 py-3 text-center text-xs tracking-[0.06em] text-[#d3dedd] md:px-8 xl:px-12">
        Designed and built for modern collaboration
      </div>
    </footer>
  );
}
