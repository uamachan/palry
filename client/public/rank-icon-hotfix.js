(() => {
  const rankIcon = {
    'Unranked': '/assets/ranks/unranked.svg',
    'Iron 1': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/3/smallicon.png',
    'Iron 2': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/4/smallicon.png',
    'Iron 3': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/5/smallicon.png',
    'Bronze 1': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/6/smallicon.png',
    'Bronze 2': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/7/smallicon.png',
    'Bronze 3': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/8/smallicon.png',
    'Silver 1': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/9/smallicon.png',
    'Silver 2': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/10/smallicon.png',
    'Silver 3': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/11/smallicon.png',
    'Gold 1': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/12/smallicon.png',
    'Gold 2': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/13/smallicon.png',
    'Gold 3': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/14/smallicon.png',
    'Platinum 1': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/15/smallicon.png',
    'Platinum 2': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/16/smallicon.png',
    'Platinum 3': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/17/smallicon.png',
    'Diamond 1': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/18/smallicon.png',
    'Diamond 2': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/19/smallicon.png',
    'Diamond 3': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/20/smallicon.png',
    'Ascendant 1': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/21/smallicon.png',
    'Ascendant 2': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/22/smallicon.png',
    'Ascendant 3': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/23/smallicon.png',
    'Immortal 1': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/24/smallicon.png',
    'Immortal 2': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/25/smallicon.png',
    'Immortal 3': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/26/smallicon.png',
    'Radiant': 'https://media.valorant-api.com/competitivetiers/564d8e28-c226-3180-6285-e48a390db8b1/27/smallicon.png'
  };

  const tierFallback = {
    Unranked: 'Unranked', Iron: 'Iron 1', Bronze: 'Bronze 1', Silver: 'Silver 1', Gold: 'Gold 1',
    Platinum: 'Platinum 1', Diamond: 'Diamond 1', Ascendant: 'Ascendant 1', Immortal: 'Immortal 1', Radiant: 'Radiant'
  };

  const localFallback = {
    Unranked: '/assets/ranks/unranked.svg', Iron: '/assets/ranks/iron.svg', Bronze: '/assets/ranks/bronze.svg',
    Silver: '/assets/ranks/silver.svg', Gold: '/assets/ranks/gold.svg', Platinum: '/assets/ranks/platinum.svg',
    Diamond: '/assets/ranks/diamond.svg', Ascendant: '/assets/ranks/ascendant.svg', Immortal: '/assets/ranks/immortal.svg',
    Radiant: '/assets/ranks/radiant.svg'
  };

  function tierFromRank(rank) {
    return String(rank || '').split(/\s+/)[0] || 'Unranked';
  }

  function updateRankIcons() {
    const grid = document.querySelector('.pv-rank-icon-grid');
    if (!grid) return;

    const activeTierButton = grid.querySelector('.pv-rank-icon-btn--on');
    const activeTierLabel = activeTierButton?.querySelector('.pv-rank-icon-label')?.textContent?.trim();
    const activeSub = document.querySelector('.pv-rank-sub-btn--on')?.textContent?.trim();
    const activeRank = activeTierLabel
      ? (activeTierLabel === 'Radiant' || activeTierLabel === 'Unranked' ? activeTierLabel : `${activeTierLabel} ${activeSub || '1'}`)
      : '';

    grid.querySelectorAll('.pv-rank-icon-btn').forEach((button) => {
      const tier = button.querySelector('.pv-rank-icon-label')?.textContent?.trim();
      const img = button.querySelector('img');
      if (!tier || !img) return;
      const desiredRank = tier === activeTierLabel ? activeRank : tierFallback[tier];
      const src = rankIcon[desiredRank] || rankIcon[tierFallback[tier]] || localFallback[tier];
      if (img.dataset.rankSrc !== src) {
        img.dataset.rankSrc = src;
        img.src = src;
      }
      img.alt = desiredRank || tier;
      img.onerror = () => {
        const fallback = localFallback[tierFromRank(desiredRank)];
        if (fallback && img.src !== fallback) img.src = fallback;
      };
    });
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('.pv-rank-icon-btn, .pv-rank-sub-btn')) {
      requestAnimationFrame(updateRankIcons);
      setTimeout(updateRankIcons, 40);
    }
  }, true);

  const observer = new MutationObserver(updateRankIcons);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'src'] });
  window.addEventListener('load', updateRankIcons);
  setInterval(updateRankIcons, 1000);
  updateRankIcons();
})();
