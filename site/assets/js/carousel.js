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
    });
});
