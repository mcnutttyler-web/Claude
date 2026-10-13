def score(stat_line, cfg):
    return round(sum(float(stat_line.get(k, 0)) * v for k, v in cfg.items()), 2)
