import Image from "next/image";

export function Footer() {
  return (
    <footer className="bg-[#0A1120] py-4 border-t border-[#1E293B] text-xs">
      <div className="max-w-7xl mx-auto px-4 flex flex-wrap justify-between items-center">
        <div className="flex space-x-6 mb-4 md:mb-0">
          <a href="#" className="text-gray-400 hover:text-white transition-colors">FAQ</a>
          <a href="#" className="text-gray-400 hover:text-white transition-colors">HOW TO PLAY</a>
          <a href="#" className="text-gray-400 hover:text-white transition-colors">T&C</a>
          <a href="#" className="text-gray-400 hover:text-white transition-colors">AML</a>
          <a href="#" className="text-gray-400 hover:text-white transition-colors">KYC</a>
          <a href="#" className="text-gray-400 hover:text-white transition-colors">RESPONSIBLE GAMING</a>
        </div>
        
        <div className="flex items-center">
          <p className="text-gray-400 mr-4">
            Amigos (For Profit) LLC. Registered in Anjouan. Contact: support@solspin.io
          </p>
          <Image 
            src="/anjouan.png" 
            alt="Anjouan License" 
            width={80} 
            height={40}
            className="opacity-70 hover:opacity-100 transition-opacity"
          />
        </div>
      </div>
    </footer>
  );
} 