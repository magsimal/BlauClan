(function($){
  if (!$ || !window.PerfectScrollbar) return;
  $.fn.perfectScrollbar = function(options){
    return this.each(function(){
      var instance = $(this).data('ps');
      if (!instance){
        instance = new PerfectScrollbar(this, options || {});
        $(this).data('ps', instance);
      } else {
        instance.update();
      }
    });
  };
})(window.jQuery);
