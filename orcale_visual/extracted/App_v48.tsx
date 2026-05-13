import { useState, useEffect } from 'motion/react';
import { motion, AnimatePresence } from 'motion/react';
import img1 from '../imports/image1.jpg?url';
import img2 from '../imports/image2.jpg?url';
import img3 from '../imports/image3.jpg?url';
import img4 from '../imports/image4.jpg?url';
import img5 from '../imports/image5.jpg?url';

const images = [img1, img2, img3, img4, img5];

export default function App() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="size-full flex items-center justify-center overflow-hidden" style={{ background: '#000000' }}>
      <div className="relative w-[70vmin] h-[70vmin]">
        {/* Crystal ball image container */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{ border: '2px solid rgba(72, 202, 228, 0.35)' }}
        >
          <AnimatePresence mode="wait">
            <motion.img
              key={currentIndex}
              src={images[currentIndex]}
              alt="Crystal ball vision"
              className="size-full object-cover"
              initial={{ opacity: 0, scale: 1.08 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 2.5, ease: 'easeInOut' }}
            />
          </AnimatePresence>
        </div>

        {/* Glass highlight overlay */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.4) 100%)',
          }}
        />

        {/* Animated #48CAE4 cyan glow ring */}
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          animate={{
            boxShadow: [
              '0 0 60px rgba(72,202,228,0.55), inset 0 0 60px rgba(72,202,228,0.25)',
              '0 0 90px rgba(72,202,228,0.85), inset 0 0 90px rgba(72,202,228,0.45)',
              '0 0 60px rgba(72,202,228,0.55), inset 0 0 60px rgba(72,202,228,0.25)',
            ],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  );
}
