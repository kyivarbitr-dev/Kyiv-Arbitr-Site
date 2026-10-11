/* Анонс мапи Prozorro на сторінці «Аналітика»: живі лічильники. */
(function(){
      (window.loadSiteData?window.loadSiteData('prozorro-summary.json'):fetch('/data/prozorro-summary.json').then(function(r){return r.ok?r.json():null})).then(function(d){
        if(!d||!d.total)return; var f=new Intl.NumberFormat('uk-UA');
        document.getElementById('pt-total').textContent=f.format(d.total);
        document.getElementById('pt-kyiv').textContent=f.format(d.kyiv||0);
        document.getElementById('pt-bk').textContent=f.format(d.bankruptcy||0);
        document.getElementById('pm-teaser-stats').hidden=false;
      }).catch(function(){});
    })();
