document.addEventListener('DOMContentLoaded', () => {
    const carousels = document.querySelectorAll('[data-carousel]');

    carousels.forEach((carousel) => {
        const track = carousel.querySelector('[data-carousel-track]');
        const slides = Array.from(carousel.querySelectorAll('[data-carousel-slide]'));
        const prevButton = carousel.querySelector('[data-carousel-prev]');
        const nextButton = carousel.querySelector('[data-carousel-next]');
        const indicators = Array.from(carousel.querySelectorAll('[data-carousel-indicator]'));

        if (!track || slides.length === 0) {
            return;
        }

        let currentIndex = 0;

        const updateCarousel = () => {
            const offset = -currentIndex * 100;
            track.style.transform = `translateX(${offset}%)`;

            indicators.forEach((indicator, index) => {
                indicator.classList.toggle('active', index === currentIndex);
            });
        };

        const goToSlide = (index) => {
            if (index < 0) {
                currentIndex = slides.length - 1;
            } else if (index >= slides.length) {
                currentIndex = 0;
            } else {
                currentIndex = index;
            }
            updateCarousel();
        };

        if (prevButton && nextButton) {
            prevButton.addEventListener('click', () => {
                goToSlide(currentIndex - 1);
            });
            nextButton.addEventListener('click', () => {
                goToSlide(currentIndex + 1);
            });
        }

        indicators.forEach((indicator, index) => {
            indicator.addEventListener('click', () => {
                goToSlide(index);
            });
        });

        // Initialize
        updateCarousel();

        // Keyboard navigation (only when controls exist)
        if (prevButton && nextButton) {
            carousel.addEventListener('keydown', (event) => {
                if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    goToSlide(currentIndex - 1);
                }
                if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    goToSlide(currentIndex + 1);
                }
            });
        }

        // Allow focusable carousel for keyboard navigation
        carousel.setAttribute('tabindex', '0');

        // Touch/swipe support for mobile
        let touchStartX = 0;
        let touchEndX = 0;
        let touchStartY = 0;
        let touchEndY = 0;

        const handleSwipe = () => {
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            
            // Only trigger swipe if horizontal movement is greater than vertical
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
                if (deltaX > 0) {
                    // Swipe right - go to previous
                    goToSlide(currentIndex - 1);
                } else {
                    // Swipe left - go to next
                    goToSlide(currentIndex + 1);
                }
            }
        };

        carousel.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        carousel.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            handleSwipe();
        }, { passive: true });
    });

    // Header shrink on scroll
    const header = document.querySelector('header');
    let suppressScrollHandler = false;
    const applyShrink = (shrink) => {
        if (!header) return;
        if (shrink) header.classList.add('shrink');
        else header.classList.remove('shrink');
    };

    const onScroll = () => {
        if (suppressScrollHandler) return;
        const y = window.scrollY;
        applyShrink(y > 10);
        // persist for back/forward restoration
        try {
            sessionStorage.setItem('homeHeaderShrink', y > 10 ? '1' : '0');
        } catch (_) {}
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Preserve homepage scroll position when navigating to a post and back
    const isHome = location.pathname === '/' || location.pathname === '/index.html';

    const restoreHomeScroll = () => {
        try {
            const y = sessionStorage.getItem('homeScrollY');
            const shrink = sessionStorage.getItem('homeHeaderShrink') === '1';
            // Apply header state before scrolling to avoid jump
            applyShrink(shrink);
            window.history.scrollRestoration = 'manual';
            suppressScrollHandler = true;
            // Mark restoring to suppress transitions/flicker
            document.documentElement.classList.add('restoring');
            // Restore after layout
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    window.scrollTo(0, y ? parseInt(y, 10) : 0);
                    // Wait a tick then re-enable handler and clear restoring
                    setTimeout(() => {
                        suppressScrollHandler = false;
                        document.documentElement.classList.remove('restoring');
                    }, 80);
                });
            });
        } catch (_) {}
    };

    const saveHomeScroll = () => {
        try {
            sessionStorage.setItem('homeScrollY', String(window.scrollY));
            sessionStorage.setItem('homeHeaderShrink', header?.classList.contains('shrink') ? '1' : '0');
        } catch (_) {}
    };

    if (isHome) {
        restoreHomeScroll();
        // Save on clicking any post card link
        document.querySelectorAll('a.post-link').forEach((a) => {
            a.addEventListener('click', saveHomeScroll, { passive: true });
        });
        // Save on unload/back-forward cache
        window.addEventListener('beforeunload', saveHomeScroll);
        window.addEventListener('pagehide', saveHomeScroll);
        // Restore also on pageshow (including bfcache restore)
        window.addEventListener('pageshow', (e) => {
            if (e.persisted || performance.getEntriesByType('navigation')[0]?.type === 'back_forward') {
                restoreHomeScroll();
            }
        });
    }
});
