// app.js

document.addEventListener('DOMContentLoaded', () => {
    const comicContainer = document.getElementById('comic-container');

    // Function to load comics dynamically
    const loadComics = async () => {
        try {
            const response = await fetch('path/to/comics/api'); // Replace with actual API endpoint
            const comics = await response.json();
            displayComics(comics);
        } catch (error) {
            console.error('Error loading comics:', error);
        }
    };

    // Function to display comics on the page
    const displayComics = (comics) => {
        comics.forEach(comic => {
            const comicCard = document.createElement('div');
            comicCard.classList.add('comic-card');
            comicCard.innerHTML = `
                <h2>${comic.title}</h2>
                <img src="${comic.image}" alt="${comic.title}">
                <p>${comic.description}</p>
            `;
            comicContainer.appendChild(comicCard);
        });
    };

    // Load comics when the page is ready
    loadComics();
});