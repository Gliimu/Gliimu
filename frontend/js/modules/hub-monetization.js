// frontend/js/modules/hub-monetization.js
import { supabase } from './supabase.js';

class HubMonetization {
    constructor() {
        this.adImpressions = 0;
        this.currentAd = null;
        this.sponsors = [];
        this.sponsoredContent = [];
    }

    async loadSponsors() {
        const { data, error } = await supabase
            .from('sponsors')
            .select('*')
            .eq('active', true)
            .order('priority', { ascending: true });
        
        if (!error && data) {
            this.sponsors = data;
        }
        return this.sponsors;
    }

    async loadSponsoredContent() {
        const { data, error } = await supabase
            .from('sponsored_content')
            .select('*')
            .eq('active', true)
            .order('created_at', { ascending: false });
        
        if (!error && data) {
            this.sponsoredContent = data;
        }
        return this.sponsoredContent;
    }

    displayBannerAd() {
        const bannerContainer = document.getElementById('bannerAd');
        if (!bannerContainer) return;

        const activeSponsors = this.sponsors.filter(s => s.ad_type === 'banner');
        if (activeSponsors.length === 0) {
            bannerContainer.classList.add('hidden');
            return;
        }

        // Rotate ads
        const adIndex = Math.floor(Date.now() / 30000) % activeSponsors.length;
        const ad = activeSponsors[adIndex];
        
        bannerContainer.innerHTML = `
            <div class="bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg p-4 text-white">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm opacity-90">Sponsored</p>
                        <p class="font-bold">${ad.company_name}</p>
                        <p class="text-sm">${ad.ad_text}</p>
                    </div>
                    ${ad.logo_url ? `<img src="${ad.logo_url}" alt="${ad.company_name}" class="h-12 w-12 rounded-full object-cover">` : ''}
                </div>
                ${ad.cta_url ? `<a href="${ad.cta_url}" target="_blank" class="mt-2 inline-block text-sm underline">Learn More →</a>` : ''}
            </div>
        `;
        
        this.trackImpression(ad.id);
        bannerContainer.classList.remove('hidden');
    }

    displaySidebarAds() {
        const sidebarContainer = document.getElementById('sidebarAds');
        if (!sidebarContainer) return;

        const sidebarAds = this.sponsors.filter(s => s.ad_type === 'sidebar');
        if (sidebarAds.length === 0) {
            sidebarContainer.classList.add('hidden');
            return;
        }

        const adsToShow = sidebarAds.slice(0, 3);
        sidebarContainer.innerHTML = adsToShow.map(ad => `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-4">
                ${ad.image_url ? `<img src="${ad.image_url}" alt="${ad.company_name}" class="w-full h-32 object-cover rounded mb-3">` : ''}
                <h4 class="font-bold mb-1">${ad.company_name}</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">${ad.ad_text}</p>
                ${ad.cta_url ? `<a href="${ad.cta_url}" target="_blank" class="text-primary-600 text-sm font-semibold">Visit Site →</a>` : ''}
            </div>
        `).join('');
        
        sidebarContainer.classList.remove('hidden');
        
        // Track impressions
        sidebarAds.forEach(ad => this.trackImpression(ad.id));
    }

    displaySponsoredVideo() {
        const videoContainer = document.getElementById('sponsoredVideo');
        if (!videoContainer) return;

        const sponsoredVideos = this.sponsoredContent.filter(c => c.content_type === 'video');
        if (sponsoredVideos.length === 0) {
            videoContainer.classList.add('hidden');
            return;
        }

        const video = sponsoredVideos[0];
        videoContainer.innerHTML = `
            <div class="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                <div class="relative">
                    <video src="${video.content_url}" controls class="w-full"></video>
                    <div class="absolute top-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                        Sponsored
                    </div>
                </div>
                <div class="p-3">
                    <h3 class="font-bold">${video.title}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400">Presented by ${video.sponsor_name}</p>
                </div>
            </div>
        `;
        
        this.trackImpression(video.id);
        videoContainer.classList.remove('hidden');
    }

    displayAffiliateLinks() {
        const affiliateContainer = document.getElementById('affiliateLinks');
        if (!affiliateContainer) return;

        const affiliates = this.sponsoredContent.filter(c => c.content_type === 'affiliate');
        if (affiliates.length === 0) {
            affiliateContainer.classList.add('hidden');
            return;
        }

        affiliateContainer.innerHTML = `
            <div class="bg-yellow-50 dark:bg-yellow-900 rounded-lg p-4">
                <h4 class="font-bold mb-3 flex items-center">
                    <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v10H5V5z"/>
                    </svg>
                    Recommended Tools
                </h4>
                <div class="space-y-3">
                    ${affiliates.map(aff => `
                        <a href="${aff.content_url}" target="_blank" rel="sponsored" class="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                            <div>
                                <p class="font-semibold">${aff.title}</p>
                                <p class="text-sm text-gray-600 dark:text-gray-400">${aff.description}</p>
                            </div>
                            <span class="text-primary-600">→</span>
                        </a>
                    `).join('')}
                </div>
            </div>
        `;
        
        affiliateContainer.classList.remove('hidden');
    }

    async trackImpression(contentId) {
        this.adImpressions++;
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        await supabase
            .from('ad_impressions')
            .insert({
                user_id: user.id,
                content_id: contentId,
                timestamp: new Date().toISOString()
            });
    }

    async trackClick(contentId, url) {
        const { data: { user } } = await supabase.auth.getUser();
        
        await supabase
            .from('ad_clicks')
            .insert({
                user_id: user?.id,
                content_id: contentId,
                url: url,
                timestamp: new Date().toISOString()
            });
        
        // Open URL in new tab
        window.open(url, '_blank');
    }

    async init() {
        await this.loadSponsors();
        await this.loadSponsoredContent();
        
        this.displayBannerAd();
        this.displaySidebarAds();
        this.displaySponsoredVideo();
        this.displayAffiliateLinks();
        
        // Rotate banner ads every 30 seconds
        setInterval(() => this.displayBannerAd(), 30000);
    }
}

export const hubMonetization = new HubMonetization();
