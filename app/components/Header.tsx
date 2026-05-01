export default function Header() {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-6 flex flex-col items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/yum_logo.png" alt="Yum of India" className="h-32 w-auto" />
      <span className="text-xl font-bold text-gray-800 mt-2 tracking-wide">Yum Shift4 Daily Dashboard</span>
    </header>
  )
}
