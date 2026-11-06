import React, { useEffect, useRef, useState } from 'react';
import { AtSign, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, MapPin, Scissors, Smartphone } from 'lucide-react';
import { User, ClothPost, UserRole } from '../types';
import './LandingPage.css';

interface LandingPageProps {
  onOpenAuth: (defaultRole: UserRole) => void;
  onNavigate: (view: string) => void;
  isDarkMode: boolean;
  promotedTailors: User[];
  promotedPosts: ClothPost[];
  onSelectSeller: (seller: User) => void;
}

const slides: { eyebrow: string; title: string; highlight: string; description: string; action: string; role: UserRole; image: string; imagePosition: string; note: string; imageCredit?: string; imageCreditUrl?: string }[] = [
  {
    eyebrow: 'Made for the way you dress',
    title: 'Wear something',
    highlight: 'made for you.',
    description: 'Meet skilled tailors who turn your ideas, your measurements, and your favourite fabric into a fit that feels unmistakably yours.',
    action: 'Find your tailor',
    role: 'buyer',
    image: '/assets/landing-fashion.jpg',
    imagePosition: 'center 52%',
    note: 'A better fit begins with a conversation',
  },
  {
    eyebrow: 'A marketplace for makers',
    title: 'Your craft deserves',
    highlight: 'to be seen.',
    description: 'Build your studio’s presence, share the details behind your work, and find people who value the skill in every stitch.',
    action: 'Join as a tailor',
    role: 'tailor',
    image: '/assets/landing-sewing-machine.jpg',
    imagePosition: 'center 48%',
    note: 'For independent tailors and studios',
    imageCredit: 'Photo: Orce Wiki · CC BY-SA 4.0',
    imageCreditUrl: 'https://commons.wikimedia.org/wiki/File:Hand_sewing_machine_-_Macedonian_tailoring_craft.jpg',
  },
  {
    eyebrow: 'The details make the design',
    title: 'Find fabric worth',
    highlight: 'creating for.',
    description: 'Explore distinctive textiles and meet trusted fabric sellers who help bring your next one-of-a-kind look to life.',
    action: 'Explore fabrics',
    role: 'buyer',
    image: '/assets/landing-textiles.jpg',
    imagePosition: 'center 55%',
    note: 'Discover textiles from independent sellers',
  },
];

const offerings = [
  {
    category: 'Find your people',
    title: 'Good craft, closer to home.',
    description: 'Discover independent tailors and fabric merchants, and find the makers bringing style to your corner of the world.',
    action: 'Explore the marketplace',
    icon: MapPin,
    onSelect: (onNavigate: (view: string) => void, onOpenAuth: (role: UserRole) => void) => onNavigate('marketplace'),
  },
  {
    category: 'Make it yours',
    title: 'A name and a space of your own.',
    description: 'Give your studio a memorable handle, show off what you do, and make it easy for the right customers to find you.',
    action: 'Create your tailor profile',
    icon: AtSign,
    onSelect: (_onNavigate: (view: string) => void, onOpenAuth: (role: UserRole) => void) => onOpenAuth('tailor'),
  },
  {
    category: 'Show the story',
    title: 'Let every stitch have a story.',
    description: 'Share your latest looks, works in progress, and favourite fabrics through visual stories made for discovery.',
    action: 'Meet the makers',
    icon: BookOpen,
    onSelect: (onNavigate: (view: string) => void, _onOpenAuth: (role: UserRole) => void) => onNavigate('artisan'),
  },
  {
    category: 'Made for real life',
    title: 'Your atelier, wherever you are.',
    description: 'Browse, connect, and keep up with your favourite makers from the device already in your hand.',
    action: 'Find your next favourite',
    icon: Smartphone,
    onSelect: (onNavigate: (view: string) => void, _onOpenAuth: (role: UserRole) => void) => onNavigate('marketplace'),
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth, onNavigate, isDarkMode, promotedTailors, promotedPosts, onSelectSeller }) => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [typedHighlight, setTypedHighlight] = useState('');
  const [loadedSlides, setLoadedSlides] = useState<Set<number>>(() => new Set());
  const [revealedSlide, setRevealedSlide] = useState<number | null>(null);
  const [offeringsVisible, setOfferingsVisible] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const offeringsRef = useRef<HTMLElement | null>(null);

  const showSlide = (index: number) => {
    setTypedHighlight('');
    setRevealedSlide(null);
    setActiveSlide((index + slides.length) % slides.length);
  };

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setPrefersReducedMotion(motionPreference.matches);
    motionPreference.addEventListener('change', updateMotionPreference);
    return () => motionPreference.removeEventListener('change', updateMotionPreference);
  }, []);

  useEffect(() => {
    if (isPressed || isHovered || prefersReducedMotion) return;
    const timer = window.setInterval(() => {
      showSlide(activeSlide + 1);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [isPressed, isHovered, prefersReducedMotion, activeSlide]);

  useEffect(() => {
    if (!loadedSlides.has(activeSlide) || revealedSlide !== activeSlide) return;
    if (prefersReducedMotion) {
      setTypedHighlight(slides[activeSlide].highlight);
      return;
    }

    setTypedHighlight('');
    let characterIndex = 0;
    const timer = window.setInterval(() => {
      characterIndex += 1;
      setTypedHighlight(slides[activeSlide].highlight.slice(0, characterIndex));
      if (characterIndex >= slides[activeSlide].highlight.length) window.clearInterval(timer);
    }, 48);

    return () => window.clearInterval(timer);
  }, [activeSlide, loadedSlides, prefersReducedMotion, revealedSlide]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setOfferingsVisible(true);
      return;
    }

    const section = offeringsRef.current;
    if (!section) return;
    if (!('IntersectionObserver' in window)) {
      setOfferingsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setOfferingsVisible(true);
      observer.disconnect();
    }, { threshold: 0.18 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (!isPressed) return;
    const resumeSlideshow = () => setIsPressed(false);
    window.addEventListener('pointerup', resumeSlideshow);
    window.addEventListener('pointercancel', resumeSlideshow);
    return () => {
      window.removeEventListener('pointerup', resumeSlideshow);
      window.removeEventListener('pointercancel', resumeSlideshow);
    };
  }, [isPressed]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      showSlide(activeSlide + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showSlide(activeSlide - 1);
    }
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (touchStart === null) return;
    const distance = touchStart - event.changedTouches[0].clientX;
    if (Math.abs(distance) > 48) showSlide(activeSlide + (distance > 0 ? 1 : -1));
    setTouchStart(null);
  };

  const handleImageReveal = (event: React.AnimationEvent<HTMLDivElement>, index: number) => {
    if (event.target === event.currentTarget && event.animationName === 'landing-image-fade-in') {
      setRevealedSlide(index);
    }
  };

  const slide = slides[activeSlide];

  return (
    <div className={`landing-page ${isDarkMode ? 'landing-page-dark' : 'landing-page-light'}`}>
      <section
        className="landing-hero"
        aria-label="Fabsattire introduction"
        aria-roledescription="carousel"
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onPointerDown={() => setIsPressed(true)}
        onPointerUp={() => setIsPressed(false)}
        onPointerCancel={() => setIsPressed(false)}
        onTouchStart={event => setTouchStart(event.touches[0].clientX)}
        onTouchEnd={handleTouchEnd}
      >
        <div className="landing-hero-images" aria-hidden="true">
          {slides.map((item, index) => (
            <div
              className={`landing-hero-image ${index === activeSlide ? 'is-active' : ''}`}
              key={item.image}
              onAnimationEnd={event => handleImageReveal(event, index)}
            >
              {(index === activeSlide || index === (activeSlide + 1) % slides.length) && (
                <img
                  src={item.image}
                  alt=""
                  style={{ objectPosition: item.imagePosition }}
                  loading={index === activeSlide ? 'eager' : 'lazy'}
                  fetchPriority={index === 0 ? 'high' : 'auto'}
                  onLoad={() => setLoadedSlides(current => new Set(current).add(index))}
                />
              )}
            </div>
          ))}
        </div>
        <div className="landing-hero-grain" aria-hidden="true" />
        <div className="landing-hero-content" key={activeSlide}>
          <div className="landing-hero-copy">
            <p className="landing-eyebrow"><span />{slide.eyebrow}</p>
            <h1 aria-label={`${slide.title} ${slide.highlight}`}>
              <span aria-hidden="true">{slide.title}</span>
              <strong className="landing-typewriter">
                <span className="landing-typewriter-reserve" aria-hidden="true">{slide.highlight}</span>
                <span className="landing-typewriter-live" aria-hidden="true">
                {typedHighlight}
                {typedHighlight.length > 0 && typedHighlight.length < slide.highlight.length && (
                  <span className="landing-typewriter-caret" />
                )}
                </span>
              </strong>
            </h1>
            <p className="landing-description">{slide.description}</p>
            <div className="landing-actions">
              <button type="button" className="landing-primary-action" onClick={() => onOpenAuth(slide.role)}>
                {slide.action}
                <ArrowUpRight aria-hidden="true" size={18} />
              </button>
              <span className="landing-action-note"><Scissors aria-hidden="true" size={15} /> Made with intention</span>
            </div>
          </div>
        </div>
        <div className="landing-hero-note" aria-hidden="true">
          <span className="landing-note-rule" />
          <span>{slide.note}</span>
        </div>
        {slide.imageCredit && slide.imageCreditUrl && (
          <a className="landing-image-credit" href={slide.imageCreditUrl} target="_blank" rel="noreferrer">
            {slide.imageCredit}
          </a>
        )}

        <div className="landing-hero-footer">
          <div className="landing-carousel-controls" role="group" aria-label="Carousel position">
            <span className="landing-slide-count"><strong>0{activeSlide + 1}</strong><span />0{slides.length}</span>
            <div className="landing-slide-dots" role="group" aria-label="Choose a featured story">
              {slides.map((item, index) => (
                <button
                  type="button"
                  key={item.eyebrow}
                  className={index === activeSlide ? 'is-active' : ''}
                  aria-label={`Show story ${index + 1}: ${item.eyebrow}`}
                  aria-pressed={index === activeSlide}
                  onClick={() => showSlide(index)}
                />
              ))}
            </div>
          </div>
        </div>
        <button type="button" className="landing-control-button landing-control-prev" aria-label="Previous story" onClick={() => showSlide(activeSlide - 1)}>
          <ArrowLeft aria-hidden="true" size={17} />
        </button>
        <button type="button" className="landing-control-button landing-control-next" aria-label="Next story" onClick={() => showSlide(activeSlide + 1)}>
          <ArrowRight aria-hidden="true" size={17} />
        </button>
      </section>

      <section
        ref={offeringsRef}
        className={`landing-offerings ${offeringsVisible ? 'is-visible' : ''}`}
        aria-labelledby="landing-offerings-heading"
      >
        <div className="landing-offerings-heading">
          <p className="landing-featured-eyebrow">A little more than a marketplace</p>
          <h2 id="landing-offerings-heading">A place for the whole craft.</h2>
          <p>Find inspiration, meet your people, and make a name for the work you love.</p>
        </div>
        <div className="landing-offerings-grid">
          {offerings.map(({ category, title, description, action, icon: Icon, onSelect }, index) => (
            <article className="landing-offering-card" key={category} style={{ transitionDelay: `${index * 90}ms` }}>
              <div className="landing-offering-card-top">
                <span className="landing-offering-icon"><Icon aria-hidden="true" size={21} /></span>
                <span className="landing-offering-index">0{index + 1}</span>
              </div>
              <p className="landing-offering-category">{category}</p>
              <h3>{title}</h3>
              <p className="landing-offering-description">{description}</p>
              <button type="button" className="landing-offering-action" onClick={() => onSelect(onNavigate, onOpenAuth)}>
                {action}<ArrowRight aria-hidden="true" size={15} />
              </button>
            </article>
          ))}
        </div>
      </section>

      {promotedTailors.length > 0 && (
        <section className="landing-featured" aria-labelledby="featured-tailors-heading">
          <div className="landing-featured-heading">
            <div>
              <p className="landing-featured-eyebrow">Good work, worth discovering</p>
              <h2 id="featured-tailors-heading">Meet the makers</h2>
            </div>
            <span>Swipe to explore <ArrowRight aria-hidden="true" size={14} /></span>
          </div>
          <div className="landing-featured-list">
            {promotedTailors.map((tailor) => {
              const project = promotedPosts.find(post => post.authorId === tailor.id && (post.imageUrl || post.imageAssets?.length));
              const image = project?.imageUrl || project?.imageAssets?.[0]?.url || tailor.avatarUrl;
              return (
                <button
                  key={tailor.id}
                  type="button"
                  onClick={() => onSelectSeller(tailor)}
                  className="landing-tailor-card"
                >
                  <div className="landing-tailor-image">
                    {image ? <img src={image} alt={`${tailor.shopName || tailor.name} promotion`} loading="lazy" /> : <div className="landing-tailor-placeholder" />}
                    <span>Featured studio</span>
                  </div>
                  <div className="landing-tailor-details">
                    <h3>{tailor.shopName || tailor.name}</h3>
                    <p>{tailor.bio || 'Bespoke designer and fashion specialist'}</p>
                    <span>{tailor.location?.city || tailor.location?.state || 'Independent studio'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
