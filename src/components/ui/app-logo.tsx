export function AppLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Electric Plug Icon */}
      <path d="M60 40V80M100 40V80" stroke="currentColor" className="text-primary" strokeWidth="12" strokeLinecap="round"/>
      <rect x="50" y="80" width="60" height="70" rx="10" fill="currentColor" className="text-primary"/>
      <path d="M80 150C80 180 60 200 40 200" stroke="currentColor" className="text-primary" strokeWidth="12" strokeLinecap="round" fill="none"/>
      <path d="M72 100L65 120H75L68 140" stroke="currentColor" className="text-background" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
      
      {/* Text: Lapor Mati Lampu */}
      <text x="130" y="105" fill="currentColor" className="text-primary" fontFamily="Inter, sans-serif" fontSize="52" fontWeight="bold">Lapor</text>
      <text x="130" y="155" fill="currentColor" className="text-foreground" fontFamily="Inter, sans-serif" fontSize="52" fontWeight="bold">Mati</text>
      <text x="130" y="205" fill="currentColor" className="text-foreground" fontFamily="Inter, sans-serif" fontSize="52" fontWeight="bold">Lampu</text>
      
      {/* Location Pin Icon */}
      <path d="M430 70C402.386 70 380 92.3858 380 120C380 155 430 210 430 210C430 210 480 155 480 120C480 92.3858 457.614 70 430 70Z" fill="currentColor" className="text-primary"/>
      <circle cx="430" cy="120" r="18" fill="currentColor" className="text-background"/>
    </svg>
  );
}
